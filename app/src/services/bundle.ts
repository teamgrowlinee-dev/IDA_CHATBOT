import type { Bundle, BundleAnswers, BundleItem, ProductCard } from "../types/chat.js";
import { fetchProductCatalog } from "./storefront-tools.js";
import { BUNDLE_ROLES, ROOM_CATEGORIES, parseBudgetMax, scoreCatalogProduct } from "./bundle-recipe.js";
import { generateBundlesWithAI, type CatalogItemForAI } from "./llm.js";
import { env } from "../config/env.js";

interface CatalogProductRaw {
  id: string;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number;
  variantId: string;
  permalink: string;
  categories: string[];
  description: string;
}

function toProductCard(p: CatalogProductRaw): ProductCard {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    image: p.image,
    price: `${p.price.toFixed(2)}€`,
    compareAtPrice: p.compareAtPrice > p.price ? `${p.compareAtPrice.toFixed(2)}€` : undefined,
    reason: "",
    variantId: p.variantId,
    permalink: p.permalink,
    categoryNames: p.categories
  };
}

// Pre-filter by room keywords so AI receives a relevant, smaller catalog
function filterByRoom(catalog: CatalogProductRaw[], room: string): CatalogProductRaw[] {
  const keywords = ROOM_CATEGORIES[room] ?? [];
  if (!keywords.length) return catalog.slice(0, 60);
  const filtered = catalog.filter((p) => {
    const allText = [p.title, ...p.categories, p.description].join(" ").toLowerCase();
    return keywords.some((kw) => allText.includes(kw));
  });
  // Broaden if room filter yields too few candidates
  return filtered.length >= 5 ? filtered.slice(0, 60) : catalog.slice(0, 60);
}

// Fallback: scoring-based bundle building (used when OpenAI is unavailable)
function buildBundlesByScoring(filtered: CatalogProductRaw[], answers: BundleAnswers): Bundle[] {
  const budgetMax = parseBudgetMax(answers);
  const roleSlots = BUNDLE_ROLES[answers.room] ?? [
    { role: "ankur" as const, keywords: [], required: true },
    { role: "lisatoode" as const, keywords: [], required: true },
    { role: "aksessuaar" as const, keywords: [], required: false }
  ];

  const roleRanked: ProductCard[][] = roleSlots.map((slot) => {
    let candidates = filtered.filter((p) => {
      if (!slot.keywords.length) return true;
      const allText = [p.title, ...p.categories, p.description].join(" ").toLowerCase();
      return slot.keywords.some((kw) => allText.includes(kw));
    });
    if (!candidates.length) candidates = filtered;
    return candidates
      .map((p) => ({ card: toProductCard(p), score: scoreCatalogProduct(toProductCard(p), answers) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.card)
      .slice(0, 10);
  });

  const bundles: Bundle[] = [];
  for (let i = 0; i < 3; i++) {
    const items: BundleItem[] = [];
    const usedIds = new Set<string>();
    for (let si = 0; si < roleSlots.length; si++) {
      const slot = roleSlots[si];
      const candidates = roleRanked[si] ?? [];
      let picked: ProductCard | null = null;
      let ci = i;
      while (ci < candidates.length) {
        if (!usedIds.has(candidates[ci].id)) { picked = candidates[ci]; break; }
        ci++;
      }
      if (!picked && slot.required) {
        const fallback = filtered.find((p) => !usedIds.has(p.id));
        if (fallback) picked = toProductCard(fallback);
      }
      if (picked) {
        usedIds.add(picked.id);
        items.push({
          ...picked,
          roleInBundle: slot.role,
          whyChosen: slot.role === "ankur" ? "Komplekti põhitoode" : slot.role === "lisatoode" ? "Täiendab põhitoodet" : "Viimistleb ruumi"
        });
      }
    }
    if (!items.length) continue;
    const totalPrice = items.reduce((s, item) => s + parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0"), 0);
    bundles.push({
      title: `Komplekt ${i + 1}`,
      styleSummary: `${answers.style} stiil, ${answers.colorTone.toLowerCase()} toonid`,
      totalPrice,
      items,
      keyReasons: [
        `Sobib ${answers.room.toLowerCase()}`,
        `Eelarve kuni ${budgetMax}€`,
        answers.hasChildren || answers.hasPets ? "Vastupidavad materjalid" : `${answers.style} stiil`
      ],
      tradeoffs: totalPrice > budgetMax ? [`Koguhind ületab eelarve ${(totalPrice - budgetMax).toFixed(0)}€ võrra`] : []
    });
  }
  return bundles;
}

export async function generateBundles(answers: BundleAnswers): Promise<Bundle[]> {
  const rawCatalog = (await fetchProductCatalog()) as unknown as CatalogProductRaw[];
  const filtered = filterByRoom(rawCatalog, answers.room);

  // Build a lookup map: id → full raw product
  const catalogById = new Map<string, CatalogProductRaw>();
  for (const p of rawCatalog) catalogById.set(p.id, p);

  // AI path — AI receives simplified catalog and selects products itself
  if (env.USE_OPENAI && env.OPENAI_API_KEY) {
    const simplifiedCatalog: CatalogItemForAI[] = filtered.map((p) => ({
      id: p.id,
      title: p.title,
      price: `${p.price.toFixed(2)}€`,
      categories: p.categories,
      description: p.description.slice(0, 200)
    }));

    try {
      const aiBundles = await generateBundlesWithAI(simplifiedCatalog, answers);
      if (aiBundles && aiBundles.length > 0) {
        const result = aiBundles
          .map((ab) => {
            const items: BundleItem[] = ab.items
              .map((ai) => {
                const raw = catalogById.get(ai.id);
                if (!raw) return null;
                return { ...toProductCard(raw), roleInBundle: ai.roleInBundle, whyChosen: ai.whyChosen } satisfies BundleItem;
              })
              .filter((x): x is BundleItem => x !== null);

            if (!items.length) return null;
            const totalPrice = items.reduce(
              (s, item) => s + parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0"), 0
            );
            return { title: ab.title, styleSummary: ab.styleSummary, totalPrice, items, keyReasons: ab.keyReasons, tradeoffs: ab.tradeoffs };
          })
          .filter((b): b is Bundle => b !== null);

        if (result.length > 0) return result;
      }
    } catch (err) {
      console.error("[generateBundles] AI selection failed, falling back to scoring:", err);
    }
  }

  // Fallback: scoring-based selection (no OpenAI key or AI call failed)
  return buildBundlesByScoring(filtered, answers);
}
