import type { Bundle, BundleAnswers, BundleItem } from "../types/chat.js";
import { fetchProductCatalog } from "./storefront-tools.js";
import { BUNDLE_ROLES, ROOM_CATEGORIES, parseBudgetMax, scoreCatalogProduct } from "./bundle-recipe.js";
import { generateBundleSummary } from "./llm.js";
import { env } from "../config/env.js";
import type { ProductCard } from "../types/chat.js";

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

// Convert raw catalog product to ProductCard format for scoring
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

function filterByRoom(catalog: CatalogProductRaw[], room: string): CatalogProductRaw[] {
  const keywords = ROOM_CATEGORIES[room] ?? [];
  if (!keywords.length) return catalog;
  return catalog.filter((p) => {
    const allText = [p.title, ...p.categories, p.description].join(" ").toLowerCase();
    return keywords.some((kw) => allText.includes(kw));
  });
}

function filterByMaterial(catalog: CatalogProductRaw[], material: string): CatalogProductRaw[] {
  if (material === "Pole vahet") return catalog;
  const matLower = material.toLowerCase();
  return catalog.filter((p) => {
    const allText = [p.title, ...p.categories, p.description].join(" ").toLowerCase();
    return allText.includes(matLower);
  });
}

function matchesRoleKeywords(product: CatalogProductRaw, keywords: string[]): boolean {
  const allText = [product.title, ...product.categories, product.description].join(" ").toLowerCase();
  return keywords.some((kw) => allText.includes(kw));
}

export async function generateBundles(answers: BundleAnswers): Promise<Bundle[]> {
  const rawCatalog = (await fetchProductCatalog()) as unknown as CatalogProductRaw[];

  // Filter by room relevance
  let filtered = filterByRoom(rawCatalog, answers.room);

  // Soft filter by material if specified (don't hard-filter, just reduce candidates)
  const budgetMax = parseBudgetMax(answers);

  // Build role slots
  const roleSlots = BUNDLE_ROLES[answers.room] ?? [
    { role: "ankur" as const, keywords: [], required: true },
    { role: "lisatoode" as const, keywords: [], required: true },
    { role: "aksessuaar" as const, keywords: [], required: false }
  ];

  // Score all products per role slot
  const roleRanked: Array<ProductCard[]> = roleSlots.map((slot) => {
    let candidates = filtered.filter((p) => {
      if (slot.keywords.length === 0) return true;
      return matchesRoleKeywords(p, slot.keywords);
    });

    if (!candidates.length) candidates = filtered;

    // Sort by score descending
    return candidates
      .map((p) => ({ card: toProductCard(p), score: scoreCatalogProduct(toProductCard(p), answers) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.card)
      .slice(0, 10); // keep top 10 per role
  });

  // Build up to 3 bundles by picking rank 0/1/2 candidate per role slot
  const bundles: Bundle[] = [];
  for (let i = 0; i < 3; i++) {
    const items: BundleItem[] = [];
    const usedIds = new Set<string>();

    for (let slotIdx = 0; slotIdx < roleSlots.length; slotIdx++) {
      const slot = roleSlots[slotIdx];
      const candidates = roleRanked[slotIdx] ?? [];

      // Pick i-th unique candidate
      let picked: ProductCard | null = null;
      let candidateIdx = i;
      while (candidateIdx < candidates.length) {
        const candidate = candidates[candidateIdx];
        if (!usedIds.has(candidate.id)) {
          picked = candidate;
          break;
        }
        candidateIdx++;
      }

      // Fallback to any unfiltered product if no candidate found for required slot
      if (!picked && slot.required) {
        const fallback = filtered.find((p) => !usedIds.has(p.id));
        if (fallback) picked = toProductCard(fallback);
      }

      if (picked) {
        usedIds.add(picked.id);
        items.push({
          ...picked,
          roleInBundle: slot.role,
          whyChosen: slot.role === "ankur"
            ? "Komplekti põhitoode"
            : slot.role === "lisatoode"
              ? "Täiendab põhitoodet"
              : "Viimistleb ruumi"
        });
      }
    }

    if (!items.length) continue;

    const totalPrice = items.reduce((sum, item) => {
      const price = parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0");
      return sum + price;
    }, 0);

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

  // Enrich with AI summaries if OpenAI is available
  if (env.USE_OPENAI && env.OPENAI_API_KEY && bundles.length > 0) {
    try {
      const enriched = await generateBundleSummary(answers, bundles);
      if (enriched.length > 0) return enriched;
    } catch (err) {
      console.error("[generateBundles] LLM summary failed, returning raw bundles:", err);
    }
  }

  return bundles;
}
