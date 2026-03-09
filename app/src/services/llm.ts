import OpenAI from "openai";
import { env } from "../config/env.js";
import { buildKnowledgeBlock, commerceConfig } from "../config/policies.js";
import type { Bundle, BundleAnswers, ChatIntent } from "../types/chat.js";

const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
console.info(
  `[llm] mode useOpenAI=${env.USE_OPENAI} hasKey=${Boolean(env.OPENAI_API_KEY)} model=${env.OPENAI_MODEL}`
);

const STORE_KNOWLEDGE = buildKnowledgeBlock();

const STRICT_RULES = `
REEGLID, mida sa PEAD järgima:
1. Vasta AINULT allpool toodud poe teabe põhjal. Kui vastust ei ole teabes olemas, ütle ausalt "Kahjuks ei oska sellele vastata. Palun võta ühendust ${commerceConfig.supportEmail} või helista ${commerceConfig.supportPhone}."
2. Ära kunagi leiuta fakte, hindu, tähtaegu ega tingimusi, mida teabes pole.
3. Vasta eesti keeles, lühidalt (1-3 lauset), sõbralikult ja konkreetselt.
4. Ära väljasta tootenimesid, hindu ega tootekaarte tekstivastusena - tootesoovitused tulevad eraldi süsteemist.
5. Kui klient on vihane või probleem on tõsine, suuna alati kontakti: ${commerceConfig.supportEmail}, ${commerceConfig.supportPhone}.
6. Sa oled IDA Sisustuspood klienditoe assistent.
7. Kui vastad tarne/tagastuse/pretensiooni/makse/privaatsuse teemal, lisa lõppu sobiv leheviide kujul: "Rohkem: /myygitingimused/" või "Rohkem: /andmekaitsetingimused/".
`.trim();

const SYSTEM_PROMPT_SUPPORT = `
Sa oled IDA Sisustuspood klienditoe vestlusassistent.

${STRICT_RULES}

POE TEAVE:
${STORE_KNOWLEDGE}
`.trim();

const SYSTEM_PROMPT_GENERAL = `
Sa oled IDA Sisustuspood vestlusassistent, kes aitab kliente sõbralikult.

${STRICT_RULES}

POE TEAVE:
${STORE_KNOWLEDGE}
`.trim();

const generate = async (input: {
  systemPrompt: string;
  userPrompt: string;
  fallback: string;
}) => {
  if (!env.USE_OPENAI || !client) {
    return input.fallback;
  }

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt }
      ]
    });

    const text = response.output_text?.trim();
    return text || input.fallback;
  } catch (error) {
    console.error(
      "[llm] OpenAI request failed:",
      error instanceof Error ? error.message : String(error)
    );
    return input.fallback;
  }
};

export const generateShortReply = async (input: {
  userText: string;
  contextSummary: string;
  fallback: string;
}) => {
  return generate({
    systemPrompt: SYSTEM_PROMPT_SUPPORT,
    userPrompt: `Kliendi küsimus: ${input.userText}\nFAQ kontekst: ${input.contextSummary}\n\nVasta 1-3 lausega ainult poe teabe põhjal. Kui FAQ kontekst sisaldab vastust, kasuta seda.`,
    fallback: input.fallback
  });
};

export const generateGeneralChatReply = async (input: {
  userText: string;
  fallback: string;
}) => {
  return generate({
    systemPrompt: SYSTEM_PROMPT_GENERAL,
    userPrompt: `Kliendi sõnum: ${input.userText}\n\nVasta lühidalt ja kasulikult. Kui klient küsib toodete kohta, palu täpsustada toote tüüpi (nt diivan, laud, valgusti, vaip, peegel) ja eelarvet. Ära leiuta hindu ega tootenimesid.`,
    fallback: input.fallback
  });
};

const SYSTEM_PROMPT_PRODUCT_SET_SUMMARY = `
Sa oled IDA Sisustuspood tooteekspert. Sulle antakse kliendi sõnum ja valitud toodete nimekiri.
Kirjuta lühike (2-3 lauset) eestikeelne kokkuvõte, mis selgitab kuidas need tooted kokku sobivad (stiil, funktsioon, ruumilahendus).
Ära korda iga toote nime eraldi - räägi tervikust. Ole sõbralik ja konkreetne.
Tagasta AINULT kokkuvõtte tekst.
`.trim();

export const generateProductSetSummary = async (input: {
  userMessage: string;
  products: { title: string; reason: string }[];
}): Promise<string> => {
  if (!env.USE_OPENAI || !client || input.products.length < 2) {
    return "";
  }

  try {
    const productList = input.products
      .map((p, i) => `${i + 1}. ${p.title} - ${p.reason}`)
      .join("\n");

    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT_PRODUCT_SET_SUMMARY },
        {
          role: "user",
          content: `KLIENDI SÕNUM: "${input.userMessage}"\n\nVALITUD TOOTED:\n${productList}\n\nKirjuta lühike kokkuvõte, miks need tooted moodustavad hea koosluse.`
        }
      ]
    });

    return response.output_text?.trim() ?? "";
  } catch (error) {
    console.error(
      "[llm] Product set summary failed:",
      error instanceof Error ? error.message : String(error)
    );
    return "";
  }
};

const SYSTEM_PROMPT_PRODUCT_RECO = `
Sa oled IDA Sisustuspood tooteekspert. Sinu ülesanne on valida kliendi vajadustele kõige sobivamad tooted kataloogist.

REEGLID:
1. Analüüsi kliendi sõnumit: ruumi tüüp, stiil, mõõdud, funktsioon, eelarve ja välistused.
2. Vali AINULT tooted, mis on kataloogis olemas. Ära leiuta tooteid.
3. Tüübiloogika on range: kui klient küsib konkreetset tüüpi (nt "öökapp"), siis ÄRA paku teisi tüüpe (nt vitriinkapp, riiul, TV-kapp).
4. Kui klient täpsustab omadust (nt "väike", "kitsas"), siis väldi tooteid, mis sellele selgelt ei vasta.
5. Kui sobib ainult 1 toode, tagasta ainult 1. Ära lisa täiteks lisatooteid.
6. Kui ükski toode ei vasta kirjeldusele piisavalt hästi, tagasta tühi massiiv [].
7. Iga toote kohta kirjuta lühike eestikeelne põhjendus (1 lause), miks see kliendile sobib.
8. Tagasta JSON massiiv kujul: [{"handle":"toote-slug","reason":"Põhjendus eesti keeles"}]
9. Tagasta maksimaalselt nii palju tooteid kui küsitud (limit).
10. Eelisjärjestus: kõige sobivam toode esimesena.
`.trim();

const SYSTEM_PROMPT_PRODUCT_SEARCH_QUERIES = `
Sa oled e-poe otsinguassistent. Sinu ülesanne on teha kliendi tekstist head WooCommerce otsingupäringud.

Tagasta AINULT JSON objekt kujul:
{"queries":["..."]}

REEGLID:
1. Tagasta 3-8 lühikest otsingupäringut.
2. Kasuta esmalt konkreetset tootetüüpi (nt kontoritool, öökapp, diivanilaud).
3. Lisa vajadusel sünonüümid ja ingliskeelne vaste (nt "chair", "office chair"), et leida rohkem sobivaid tooteid.
4. Kui klient mainib omadusi (värv, materjal, stiil), lisa need eraldi päringutena.
5. Ära lisa seletusi, ainult JSON.
`.trim();

export const generateProductSearchQueries = async (input: {
  userMessage: string;
  fallbackQueries: string[];
}): Promise<string[]> => {
  const fallback = [...new Set(input.fallbackQueries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);

  if (!env.USE_OPENAI || !client) {
    return fallback;
  }

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT_PRODUCT_SEARCH_QUERIES },
        {
          role: "user",
          content: `KLIENDI SÕNUM: "${input.userMessage}"\n\nTagasta ainult JSON.`
        }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) return fallback;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);
    const queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    const normalized = queries
      .filter((item: unknown): item is string => typeof item === "string")
      .map((query: string) => query.trim())
      .filter((query: string) => query.length >= 2 && query.length <= 64);

    const unique = [...new Set([...normalized, ...fallback])].slice(0, 10);
    return unique.length > 0 ? unique : fallback;
  } catch (error) {
    console.error(
      "[llm] Product search query planning failed:",
      error instanceof Error ? error.message : String(error)
    );
    return fallback;
  }
};

export const generateProductRecommendations = async (input: {
  userMessage: string;
  catalogSummary: string;
  limit: number;
}): Promise<{ handle: string; reason: string }[]> => {
  if (!env.USE_OPENAI || !client) {
    return [];
  }

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT_PRODUCT_RECO },
        {
          role: "user",
          content: `TOOTEKATALOOG:\n${input.catalogSummary}\n\nKLIENDI SÕNUM: "${input.userMessage}"\n\nVali kuni ${input.limit} kõige sobivamat toodet. Kui sobib ainult 1, tagasta 1. Kui ükski ei sobi, tagasta []. Tagasta AINULT JSON massiiv, mitte midagi muud.`
        }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) return [];

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: any) => item.handle && typeof item.handle === "string")
      .map((item: any) => ({
        handle: item.handle,
        reason: typeof item.reason === "string" ? item.reason : ""
      }));
  } catch (error) {
    console.error(
      "[llm] Product recommendation failed:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
};

const SYSTEM_PROMPT_INTENT_CLASSIFIER = `
Sa oled e-kaubanduse vestluse intentide klassifitseerija.

Tagasta AINULT JSON objekt kujul:
{"intent":"greeting|shipping|returns|faq|order_help|product_reco|smalltalk","confidence":0.0-1.0}

REEGLID:
- Kui kasutaja ütleb lühidalt "okei", "aitäh", "selge", "jah", "ei", "super" vms ning ei küsi midagi konkreetset, vali "smalltalk".
- Kui kasutaja küsib tarne/kohaletoimetamise kohta => "shipping".
- Kui kasutaja küsib tagastuse/taganemise/pretensiooni kohta => "returns".
- Kui kasutaja küsib garantiid, kontakte, makseviise, privaatsust, ettevõtte infot, tingimusi => "faq".
- Kui kasutaja küsib tellimuse staatust/makse/arve kohta => "order_help".
- Kui kasutaja otsib toodet või palub soovitust (nt diivan, laud, valgusti, vaip, peegel, eelarve) => "product_reco".
- Kui on puhas tervitus => "greeting".
- Kasuta vestluse ajalugu konteksti jaoks, aga klassifitseeri kasutaja VIIMANE sõnum.
`.trim();

export const classifyIntentWithContext = async (input: {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<{ intent: ChatIntent; confidence: number } | null> => {
  if (!env.USE_OPENAI || !client) return null;

  const historyText = (input.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "KLIENT" : "ASSISTENT"}: ${m.text}`)
    .join("\n");

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT_INTENT_CLASSIFIER },
        {
          role: "user",
          content: `VESTLUSE AJALUGU:\n${historyText || "(puudub)"}\n\nVIIMANE SÕNUM:\n${input.userMessage}\n\nTagasta ainult JSON.`
        }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const intent = parsed?.intent as ChatIntent;
    const confidence = Number(parsed?.confidence ?? 0);
    if (!intent) return null;
    return { intent, confidence: Number.isFinite(confidence) ? confidence : 0 };
  } catch (error) {
    console.error(
      "[llm] Intent classification failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

export interface RoomScanFrameInput {
  label: string;
  url: string;
}

export interface RoomScanAnalysis {
  summary: string;
  roomType: string;
  detectedItems: string[];
  styleHints: string[];
  colorPalette: string[];
  keywords: string[];
}

const normalizeTextList = (value: unknown, maxItems = 8): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }

  return out;
};

const buildRoomScanFallback = (framesCount: number): RoomScanAnalysis => ({
  summary:
    framesCount > 0
      ? `Skänn salvestatud (${framesCount} kaadrit). Kirjelda nüüd, millist toodet otsid, ja kasutan ruumi infot soovituste täpsustamiseks.`
      : "Skänn puudub. Lisa vähemalt 4 kaadrit, et AI saaks ruumi analüüsida.",
  roomType: "",
  detectedItems: [],
  styleHints: [],
  colorPalette: [],
  keywords: ["mööbel", "ruum", "sisustus"]
});

const parseRoomScanAnalysisJson = (raw: string): RoomScanAnalysis | null => {
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summary) return null;

    const roomType = typeof parsed.roomType === "string" ? parsed.roomType.trim() : "";
    const detectedItems = normalizeTextList(parsed.detectedItems, 10);
    const styleHints = normalizeTextList(parsed.styleHints, 6);
    const colorPalette = normalizeTextList(parsed.colorPalette, 6);
    const keywords = normalizeTextList(parsed.keywords, 12);
    const mergedKeywords = keywords.length
      ? keywords
      : normalizeTextList([...detectedItems, ...styleHints, ...colorPalette], 12);

    return {
      summary,
      roomType,
      detectedItems,
      styleHints,
      colorPalette,
      keywords: mergedKeywords
    };
  } catch {
    return null;
  }
};

const SYSTEM_PROMPT_ROOM_SCAN = `
Sa oled sisekujunduse visuaalanalüütik. Sulle antakse mitu telefoni kaadrit samast toast.
Analüüsi nähtav ruum ja tagasta AINULT JSON objekt:
{
  "summary": "1-2 lauset eesti keeles, mis kirjeldavad ruumi tervikut",
  "roomType": "elutuba|magamistuba|kontor|söögituba|lastetuba|esik|muu",
  "detectedItems": ["toode1", "toode2", "..."],
  "styleHints": ["stiil/materjal 1", "..."],
  "colorPalette": ["värv 1", "..."],
  "keywords": ["otsingu märksõna 1", "..."]
}

REEGLID:
- detectedItems peab sisaldama ainult päriselt nähtavaid asju.
- Kui pole kindel, ära lisa.
- keywords peavad olema kasulikud sisustus-toodete soovitamiseks.
- Ära lisa teksti väljaspool JSON objekti.
`.trim();

export const analyzeRoomScanFrames = async (input: {
  frames: RoomScanFrameInput[];
  roomMeta?: { width_cm?: number; length_cm?: number; height_cm?: number };
}): Promise<RoomScanAnalysis> => {
  const frames = (input.frames ?? []).slice(0, 8).filter((frame) => frame.url?.startsWith("data:image/"));
  if (frames.length === 0) {
    return buildRoomScanFallback(0);
  }

  if (!env.USE_OPENAI || !client) {
    return buildRoomScanFallback(frames.length);
  }

  const roomMetaParts: string[] = [];
  if (Number.isFinite(input.roomMeta?.width_cm)) roomMetaParts.push(`laius=${input.roomMeta?.width_cm}cm`);
  if (Number.isFinite(input.roomMeta?.length_cm)) roomMetaParts.push(`pikkus=${input.roomMeta?.length_cm}cm`);
  if (Number.isFinite(input.roomMeta?.height_cm)) roomMetaParts.push(`kõrgus=${input.roomMeta?.height_cm}cm`);

  const userContent: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [
    {
      type: "input_text",
      text: `Kaadrite arv: ${frames.length}. ${roomMetaParts.length ? `Ruumi mõõdud: ${roomMetaParts.join(", ")}.` : ""} Palun analüüsi kogu nähtavat ruumi.`
    }
  ];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    userContent.push({
      type: "input_text",
      text: `Kaader ${i + 1}: ${frame.label || "telefonikaader"}`
    });
    userContent.push({
      type: "input_image",
      image_url: frame.url
    });
  }

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT_ROOM_SCAN },
        { role: "user", content: userContent as any }
      ],
      max_output_tokens: 500
    });

    const parsed = parseRoomScanAnalysisJson(response.output_text?.trim() ?? "");
    return parsed ?? buildRoomScanFallback(frames.length);
  } catch (error) {
    console.error(
      "[llm] Room scan analysis failed:",
      error instanceof Error ? error.message : String(error)
    );
    return buildRoomScanFallback(frames.length);
  }
};

export interface CatalogItemForAI {
  id: string;
  title: string;
  price: string;
  categories: string[];
  description: string;
}

interface AIBundleItem {
  id: string;
  roleInBundle: "ankur" | "lisatoode" | "aksessuaar";
  whyChosen: string;
}

interface AIBundle {
  title: string;
  styleSummary: string;
  keyReasons: string[];
  tradeoffs: string[];
  items: AIBundleItem[];
}

// AI picks the products itself from the catalog + user answers.
// Returns Bundle[] with item IDs that the caller maps back to full ProductCards.
export const generateBundlesWithAI = async (
  catalog: CatalogItemForAI[],
  answers: BundleAnswers
): Promise<AIBundle[] | null> => {
  if (!client) return null;

  const systemPrompt = `Sa oled IDA Stuudio sisekujundusnõustaja, kes koostab personaalseid mööblikomplekte.

Saad kliendi eelistused ja poe tootekataloogist filtreeritud toodete nimekirja.
Sinu ülesanne: vali kataloogist sobivad tooted ja koosta 1–3 erinevat terviklikku mööblikomplekti.

RUUMIDE ELEMENDID (viide, milliseid tooteid eri tubades vajatakse):
- Elutuba: diivan (ankur) + kohvilaud + tugitool + TV-alus/riiul + lamp/valgusti + vaip + dekoratiivsed patjad
- Magamistuba: voodi (ankur) + öökapp + kummut/riietumislaud + peegel + lamp + vaip
- Söögituba: söögilaud (ankur) + söögitoolid + puhvet/serveerimislaud + pendel/lamp + vaip
- Köök: köögimööbel (ankur) + baaritool/taburet + riiul/hoidik + lamp
- Kontor: kirjutuslaud/töölaud (ankur) + kontoritool + riiulikapp + lamp + aksessuaarid
- Lastetuba: lastemööbel/voodi (ankur) + laud/töölaud + tool/istmik + riiul/hoiukas + lamp + vaip
- Esik: riidekapp (ankur) + nagel/riidepuu + jalatsiriiul + peegel + pingike/tool

REEGLID:
- Vali AINULT elemendid, mida klient on märkinud "Valitud elemendid" nimekirjas
- Iga toode täidab unikaalse rolli — ära lisa samast kategooriast mitut toodet
- Rollide jaotus: 1 "ankur" (peamine mööbel), 1–3 "lisatoode" (täiendav mööbel eri kategooriast), 1–2 "aksessuaar" (valgustus/tekstiil/dekor)
- Igal elemendil on oma stiilieelistus — järgi seda kui võimalik
- Kui elemendi täpset stiili kataloogis ei ole, vali sama elemendi jaoks lähim saadaolev stiil
- Kui on lapsed või lemmikloomad, väldi kangast/nahka; eelista kunstnahka, mikrofiiber
- Iga komplekt peab erinema teistest (erinev ankurtoode, fookus või stiilikombinatsioon)
- Eelarve on orienteeriv — ära sunni kõiki tooteid kataloogi piires maksimeerima
- Kui kataloogis pole mõnele elemendile sobivat toodet, jäta see element vahele
- Kui kataloogis pole piisavalt sobivaid tooteid üldse, tagasta vähem komplekte (aga vähemalt 1)
- Iga toote whyChosen väli: konkreetne eestikeelne põhjendus miks just see toode sellele kliendile sobib

Tagasta AINULT JSON massiiv, ilma selgitusteta:
[
  {
    "title": "Komplekti atraktiivne pealkiri (max 5 sõna, eesti keeles)",
    "styleSummary": "1-2 lauseline kirjeldus komplekti esteetikast ja terviklikkusest",
    "keyReasons": ["põhjus1", "põhjus2", "põhjus3"],
    "tradeoffs": ["kompromiss (kui on, muidu tühi massiiv)"],
    "items": [
      { "id": "toote_id_kataloogist", "roleInBundle": "ankur", "whyChosen": "Konkreetne põhjus eesti keeles" },
      { "id": "toote_id_kataloogist", "roleInBundle": "lisatoode", "whyChosen": "Konkreetne põhjus" },
      { "id": "toote_id_kataloogist", "roleInBundle": "aksessuaar", "whyChosen": "Viimistleb ruumi" }
    ]
  }
]`;

  const elementPrefsText = answers.elementPreferences?.length
    ? answers.elementPreferences
        .map((ep) => `  - ${ep.element}: stiil=${ep.style}`)
        .join("\n")
    : "  (täpsustamata)";
  const widthCm = Number.isFinite(answers.widthCm) && Number(answers.widthCm) > 0 ? Number(answers.widthCm) : null;
  const lengthCm =
    Number.isFinite(answers.lengthCm) && Number(answers.lengthCm) > 0 ? Number(answers.lengthCm) : null;
  const heightCm =
    Number.isFinite(answers.heightCm) && Number(answers.heightCm) > 0 ? Number(answers.heightCm) : null;
  const computedAreaM2 = widthCm !== null && lengthCm !== null ? (widthCm * lengthCm) / 10000 : null;
  const computedVolumeM3 = computedAreaM2 !== null && heightCm !== null ? (computedAreaM2 * heightCm) / 100 : null;
  const roomAreaM2 =
    Number.isFinite(answers.roomAreaM2) && Number(answers.roomAreaM2) > 0 ? Number(answers.roomAreaM2) : computedAreaM2;
  const roomVolumeM3 =
    Number.isFinite(answers.roomVolumeM3) && Number(answers.roomVolumeM3) > 0
      ? Number(answers.roomVolumeM3)
      : computedVolumeM3;
  const dimensionsLines: string[] = [];
  if (answers.dimensionsKnown) {
    dimensionsLines.push(
      `- Ruumi mõõdud (X/Y/Z): ${widthCm !== null ? `${widthCm}cm` : "?"} x ${
        lengthCm !== null ? `${lengthCm}cm` : "?"
      } x ${heightCm !== null ? `${heightCm}cm` : "?"}`
    );
    if (roomAreaM2 !== null) dimensionsLines.push(`- Ruumi pindala: ${roomAreaM2.toFixed(2)} m²`);
    if (roomVolumeM3 !== null) dimensionsLines.push(`- Ruumi maht: ${roomVolumeM3.toFixed(2)} m³`);
  }

  const userContent = `KLIENDI EELISTUSED:
- Ruum: ${answers.room}
- Soovitud ankurtoode: ${answers.anchorProduct}
- Eelarve: ${answers.budgetRange}${answers.budgetCustom ? ` (täpne: ${answers.budgetCustom}€)` : ""}
- Värvitoon (üldpalett): ${answers.colorTone}
- Lapsi majas: ${answers.hasChildren ? "Jah" : "Ei"}
- Lemmikloomi: ${answers.hasPets ? "Jah" : "Ei"}
${dimensionsLines.join("\n")}

VALITUD ELEMENDID (koosta komplekt AINULT nendest):
${(answers.selectedElements ?? []).map((e) => `  - ${e}`).join("\n") || "  (kõik ruumielemendid)"}

ELEMENTIDE STIILIEELISTUSED:
${elementPrefsText}

KATALOOG (${catalog.length} toodet):
${JSON.stringify(catalog, null, 2)}`;

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) return null;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    return JSON.parse(match[0]) as AIBundle[];
  } catch (error) {
    console.error("[llm] generateBundlesWithAI failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
};
