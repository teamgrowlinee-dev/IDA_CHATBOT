import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { buildKnowledgeBlock, commerceConfig } from "../config/policies.js";
import type { BundleAnswers, ChatIntent } from "../types/chat.js";

// ── Clients ──────────────────────────────────────────────────────
const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
const openaiClient = (!anthropic && env.USE_OPENAI && env.OPENAI_API_KEY)
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

const FAST_MODEL    = env.ANTHROPIC_FAST_MODEL;
const QUALITY_MODEL = env.ANTHROPIC_QUALITY_MODEL;

console.info(
  `[llm] provider=${anthropic ? "anthropic" : openaiClient ? "openai" : "none"} ` +
  `fast=${FAST_MODEL} quality=${QUALITY_MODEL}`
);

// ── Core helper ───────────────────────────────────────────────────
const generate = async (input: {
  systemPrompt: string;
  userPrompt: string;
  fallback: string;
  model?: "fast" | "quality";
  maxTokens?: number;
}): Promise<string> => {
  const model = input.model === "quality" ? QUALITY_MODEL : FAST_MODEL;
  const maxTokens = input.maxTokens ?? 1024;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.userPrompt }]
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      return text || input.fallback;
    } catch (error) {
      console.error("[llm] Anthropic failed:", error instanceof Error ? error.message : String(error));
      return input.fallback;
    }
  }

  if (openaiClient) {
    try {
      const response = await (openaiClient as any).responses.create({
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt }
        ]
      });
      return response.output_text?.trim() || input.fallback;
    } catch (error) {
      console.error("[llm] OpenAI failed:", error instanceof Error ? error.message : String(error));
      return input.fallback;
    }
  }

  return input.fallback;
};

// ── Prompts ───────────────────────────────────────────────────────
const STORE_KNOWLEDGE = buildKnowledgeBlock();

const STRICT_RULES = `REEGLID:
1. Vasta AINULT allpool toodud poe teabe põhjal. Kui vastust pole, ütle ausalt et ei tea ja suuna: ${commerceConfig.supportEmail} / ${commerceConfig.supportPhone}.
2. Ära leiuta fakte, hindu, tähtaegu ega tingimusi.
3. Vasta eesti keeles, lühidalt (1-3 lauset), sõbralikult.
4. Ära väljasta tootenimesid ega hindasid tekstis — tootesoovitused tulevad eraldi.
5. Vihane klient → suuna alati: ${commerceConfig.supportEmail}, ${commerceConfig.supportPhone}.`;

const SYSTEM_SUPPORT = `Sa oled IDA Sisustuspood klienditoe assistent.\n\n${STRICT_RULES}\n\nPOE TEAVE:\n${STORE_KNOWLEDGE}`;
const SYSTEM_GENERAL = `Sa oled IDA Sisustuspood vestlusassistent.\n\n${STRICT_RULES}\n\nPOE TEAVE:\n${STORE_KNOWLEDGE}`;

// ── Exported functions ────────────────────────────────────────────
export const generateShortReply = (input: { userText: string; contextSummary: string; fallback: string }) =>
  generate({
    systemPrompt: SYSTEM_SUPPORT,
    userPrompt: `Kliendi küsimus: ${input.userText}\nFAQ kontekst: ${input.contextSummary}\n\nVasta 1-3 lausega.`,
    fallback: input.fallback,
    model: "fast",
    maxTokens: 256
  });

export const generateGeneralChatReply = (input: { userText: string; fallback: string }) =>
  generate({
    systemPrompt: SYSTEM_GENERAL,
    userPrompt: `Kliendi sõnum: ${input.userText}\n\nVasta lühidalt ja kasulikult.`,
    fallback: input.fallback,
    model: "fast",
    maxTokens: 256
  });

export const generateProductSetSummary = async (input: {
  userMessage: string;
  products: { title: string; reason: string }[];
}): Promise<string> => {
  if (input.products.length < 2) return "";
  const list = input.products.map((p, i) => `${i + 1}. ${p.title} — ${p.reason}`).join("\n");
  return generate({
    systemPrompt: "Sa oled IDA Sisustuspood tooteekspert. Kirjuta lühike (2-3 lauset) eestikeelne kokkuvõte kuidas tooted kokku sobivad. Tagasta AINULT kokkuvõtte tekst.",
    userPrompt: `KLIENDI SÕNUM: "${input.userMessage}"\n\nTOOTED:\n${list}`,
    fallback: "",
    model: "fast",
    maxTokens: 200
  });
};

export const generateProductSearchQueries = async (input: {
  userMessage: string;
  fallbackQueries: string[];
}): Promise<string[]> => {
  const fallback = [...new Set(input.fallbackQueries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
  if (!anthropic && !openaiClient) return fallback;

  try {
    const text = await generate({
      systemPrompt: `Oled e-poe otsinguassistent. Tagasta AINULT JSON: {"queries":["..."]}
- 3-8 lühikest otsingupäringut
- Kasuta konkreetset tootetüüpi eesti ja inglise keeles (nt "diivan", "sofa", "couch")
- Ära lisa seletusi, ainult JSON`,
      userPrompt: `KLIENDI SÕNUM: "${input.userMessage}"\n\nTagasta ainult JSON.`,
      fallback: "",
      model: "fast",
      maxTokens: 256
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;

    const parsed = JSON.parse(match[0]);
    const queries = (Array.isArray(parsed?.queries) ? parsed.queries : [])
      .filter((q: unknown): q is string => typeof q === "string")
      .map((q: string) => q.trim())
      .filter((q: string) => q.length >= 2 && q.length <= 64);

    return [...new Set([...queries, ...fallback])].slice(0, 10) || fallback;
  } catch {
    return fallback;
  }
};

export const generateProductRecommendations = async (input: {
  userMessage: string;
  catalogSummary: string;
  limit: number;
}): Promise<{ handle: string; reason: string; isAlternative?: boolean }[]> => {
  if (!anthropic && !openaiClient) return [];

  try {
    const text = await generate({
      systemPrompt: `Oled IDA Sisustuspood tooteekspert. Vali kliendi vajadustele sobivad tooted kataloogist.

REEGLID:
1. Vali AINULT kataloogis olevad tooted. Ära leiuta.
2. Tüübiloogika: "öökapp" → AINULT öökapid. "diivan" → AINULT diivanid.
3. Esimesed ${input.limit} toodet on peamised soovitused (isAlternative: false).
4. Järgmised kuni 4 on alternatiivid (isAlternative: true) — sarnased aga erineva stiili/hinnaga.
5. Igale tootele kirjuta lühike eestikeelne põhjendus (1 lause).
6. Tagasta AINULT JSON: [{"handle":"slug","reason":"...","isAlternative":false}]`,
      userPrompt: `TOOTEKATALOOG:\n${input.catalogSummary}\n\nKLIENDI SÕNUM: "${input.userMessage}"\n\nTagasta ainult JSON massiiv.`,
      fallback: "[]",
      model: "fast",
      maxTokens: 512
    });

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: unknown): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).handle === "string"
      )
      .map((item) => ({
        handle: item.handle as string,
        reason: typeof item.reason === "string" ? item.reason : "",
        isAlternative: Boolean(item.isAlternative)
      }));
  } catch {
    return [];
  }
};

export const classifyIntentWithContext = async (input: {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<{ intent: ChatIntent; confidence: number } | null> => {
  if (!anthropic && !openaiClient) return null;

  const historyText = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "KLIENT" : "ASSISTENT"}: ${m.text}`)
    .join("\n");

  try {
    const text = await generate({
      systemPrompt: `Oled e-kaubanduse intentide klassifitseerija. Tagasta AINULT JSON: {"intent":"greeting|shipping|returns|faq|order_help|product_reco|smalltalk","confidence":0.0-1.0}

- "okei","aitäh","selge","jah","ei","super" → "smalltalk"
- tarne/kohaletoimetamine → "shipping"
- tagastus/pretensioon → "returns"
- garantii/kontaktid/tingimused/makseviisid → "faq"
- tellimuse staatus/makse/arve → "order_help"
- toode/soovitus (diivan, laud, valgusti, vaip, tool...) → "product_reco"
- tervitus → "greeting"`,
      userPrompt: `AJALUGU:\n${historyText || "(puudub)"}\n\nVIIMANE SÕNUM: ${input.userMessage}\n\nTagasta ainult JSON.`,
      fallback: "",
      model: "fast",
      maxTokens: 64
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const intent = parsed?.intent as ChatIntent;
    if (!intent) return null;
    return { intent, confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0 };
  } catch {
    return null;
  }
};

// ── Room scan (Anthropic vision only) ────────────────────────────
export interface RoomScanFrameInput { label: string; url: string; }
export interface RoomScanAnalysis {
  summary: string; roomType: string; detectedItems: string[];
  styleHints: string[]; colorPalette: string[]; keywords: string[];
}

const buildFallback = (n: number): RoomScanAnalysis => ({
  summary: n > 0 ? `Skänn salvestatud (${n} kaadrit). Kirjelda millist toodet otsid.` : "Lisa vähemalt 4 kaadrit.",
  roomType: "", detectedItems: [], styleHints: [], colorPalette: [],
  keywords: ["mööbel", "ruum", "sisustus"]
});

const normalizeList = (value: unknown, max = 8): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return (value as unknown[])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .filter((v) => { const k = v.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max);
};

export const analyzeRoomScanFrames = async (input: {
  frames: RoomScanFrameInput[];
  roomMeta?: { width_cm?: number; length_cm?: number; height_cm?: number };
}): Promise<RoomScanAnalysis> => {
  const frames = (input.frames ?? []).slice(0, 8).filter((f) => f.url?.startsWith("data:image/"));
  if (frames.length === 0) return buildFallback(0);
  if (!anthropic) return buildFallback(frames.length);

  const metaParts: string[] = [];
  if (Number.isFinite(input.roomMeta?.width_cm)) metaParts.push(`laius=${input.roomMeta!.width_cm}cm`);
  if (Number.isFinite(input.roomMeta?.length_cm)) metaParts.push(`pikkus=${input.roomMeta!.length_cm}cm`);
  if (Number.isFinite(input.roomMeta?.height_cm)) metaParts.push(`kõrgus=${input.roomMeta!.height_cm}cm`);

  try {
    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: `Kaadrite arv: ${frames.length}.${metaParts.length ? ` Mõõdud: ${metaParts.join(", ")}.` : ""} Analüüsi ruum.` }
    ];

    for (let i = 0; i < frames.length; i++) {
      const [header, data] = frames[i].url.split(",");
      const mediaType = (header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg") as
        "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      content.push({ type: "text", text: `Kaader ${i + 1}: ${frames[i].label || "kaader"}` });
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    }

    const response = await anthropic.messages.create({
      model: QUALITY_MODEL,
      max_tokens: 500,
      system: `Oled sisekujunduse visuaalanalüütik. Tagasta AINULT JSON:
{"summary":"1-2 lauset eesti keeles","roomType":"elutuba|magamistuba|kontor|söögituba|lastetuba|esik|muu","detectedItems":["..."],"styleHints":["..."],"colorPalette":["..."],"keywords":["..."]}`,
      messages: [{ role: "user", content }]
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return buildFallback(frames.length);

    const p = JSON.parse(match[0]);
    if (!p?.summary) return buildFallback(frames.length);
    return {
      summary: p.summary, roomType: p.roomType ?? "",
      detectedItems: normalizeList(p.detectedItems, 10),
      styleHints: normalizeList(p.styleHints, 6),
      colorPalette: normalizeList(p.colorPalette, 6),
      keywords: normalizeList(p.keywords, 12)
    };
  } catch (error) {
    console.error("[llm] Room scan failed:", error instanceof Error ? error.message : String(error));
    return buildFallback(frames.length);
  }
};

// ── Bundle generation ─────────────────────────────────────────────
export interface CatalogItemForAI {
  id: string; title: string; price: string; categories: string[]; description: string;
}
interface AIBundleItem { id: string; roleInBundle: "ankur" | "lisatoode" | "aksessuaar"; whyChosen: string; }
interface AIBundle { title: string; styleSummary: string; keyReasons: string[]; tradeoffs: string[]; items: AIBundleItem[]; }

export const generateBundlesWithAI = async (
  catalog: CatalogItemForAI[],
  answers: BundleAnswers
): Promise<AIBundle[] | null> => {
  if (!anthropic && !openaiClient) return null;

  const elementPrefsText = answers.elementPreferences?.length
    ? answers.elementPreferences.map((ep) => `  - ${ep.element}: stiil=${ep.style}`).join("\n")
    : "  (täpsustamata)";

  const widthCm = Number.isFinite(answers.widthCm) && Number(answers.widthCm) > 0 ? Number(answers.widthCm) : null;
  const lengthCm = Number.isFinite(answers.lengthCm) && Number(answers.lengthCm) > 0 ? Number(answers.lengthCm) : null;
  const heightCm = Number.isFinite(answers.heightCm) && Number(answers.heightCm) > 0 ? Number(answers.heightCm) : null;
  const areaM2 = widthCm && lengthCm ? (widthCm * lengthCm / 10000).toFixed(1) : null;

  try {
    const text = await generate({
      systemPrompt: `Oled IDA Stuudio sisekujundusnõustaja, kes koostab personaalseid mööblikomplekte.

RUUMIDE ELEMENDID:
- Elutuba: diivan (ankur) + kohvilaud + tugitool + TV-alus + lamp + vaip
- Magamistuba: voodi (ankur) + öökapp + kummut + peegel + lamp + vaip
- Söögituba: söögilaud (ankur) + söögitoolid + puhvet + lamp + vaip
- Kontor: kirjutuslaud (ankur) + kontoritool + riiulikapp + lamp
- Lastetuba: lastemööbel (ankur) + laud + tool + riiul + lamp + vaip

REEGLID:
- Vali AINULT "Valitud elemendid" nimekirjast
- 1 "ankur", 1-3 "lisatoode", 1-2 "aksessuaar"
- Iga komplekt erineb teistest (erinev ankur, fookus või stiil)
- Lapsed/lemmikloomad → väldi kangast/nahka, eelista kunstnahka/mikrofiiber
- whyChosen: konkreetne eestikeelne põhjendus

Tagasta AINULT JSON massiiv:
[{"title":"...","styleSummary":"...","keyReasons":["..."],"tradeoffs":["..."],"items":[{"id":"...","roleInBundle":"ankur","whyChosen":"..."}]}]`,
      userPrompt: `KLIENDI EELISTUSED:
- Ruum: ${answers.room}
- Ankurtoode: ${answers.anchorProduct}
- Eelarve: ${answers.budgetRange}${answers.budgetCustom ? ` (${answers.budgetCustom}€)` : ""}
- Värvitoon: ${answers.colorTone}
- Lapsi: ${answers.hasChildren ? "Jah" : "Ei"} | Lemmikloomi: ${answers.hasPets ? "Jah" : "Ei"}
${widthCm ? `- Mõõdud: ${widthCm}×${lengthCm ?? "?"}×${heightCm ?? "?"}cm${areaM2 ? ` (${areaM2} m²)` : ""}` : ""}

VALITUD ELEMENDID:
${(answers.selectedElements ?? []).map((e) => `  - ${e}`).join("\n") || "  (kõik)"}

STIILIEELISTUSED:
${elementPrefsText}

KATALOOG (${catalog.length} toodet):
${JSON.stringify(catalog, null, 2)}`,
      fallback: "null",
      model: "quality",
      maxTokens: 4096
    });

    if (!text || text === "null") return null;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    return JSON.parse(match[0]) as AIBundle[];
  } catch (error) {
    console.error("[llm] generateBundlesWithAI failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
};
