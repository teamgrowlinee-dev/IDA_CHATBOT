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
  categorySlugs: string[];
  categoryIds: number[];
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

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseDisplayPrice = (priceValue: string | undefined): number =>
  parseFloat(priceValue?.replace(/[^0-9.]/g, "") ?? "0");

type MenuElementKey =
  | "sofa"
  | "coffee-table"
  | "armchair"
  | "tv-storage"
  | "desk"
  | "dining-table"
  | "chair"
  | "office-chair"
  | "bed"
  | "nightstand"
  | "dresser"
  | "shelf"
  | "hall-rack"
  | "wardrobe"
  | "mirror"
  | "lamp"
  | "rug"
  | "decor"
  | "kitchen-furniture"
  | "bench";

interface RoomMenuSpec {
  allowedCategorySlugs: string[];
  elementToSpec: Record<string, MenuElementKey>;
  excludedCategorySlugs?: string[];
}

const MENU_SLUGS = {
  lighting: ["valgustid", "laevalgustid", "lauavalgustid", "p6randavalgustid", "seinavalgustid", "lastetoa-valgustid"],
  rugs: ["vaibad", "madalapinnalised-vaibad", "lastetoa-vaibad"],
  mirrors: ["peeglid", "neljakandilised-peeglid", "erikujulised-peeglid", "ummargused-peeglid", "porandapeeglid"],
  decor: ["kodu-aksessuaarid", "dekoratsioonid-seinale", "seinamaalid", "tekstiil", "padjad", "padjakatted"],
  shelves: ["riiulid", "seinariiulid", "porandariiulid-raamaturiiulid"],
  tables: ["lauad", "kirjutuslauad", "s66gilauad", "diivanilauad", "abilauad", "konsoollauad"],
  chairs: ["toolid", "soogitoolid", "tugitoolid", "baaritoolid", "taburetid", "kontoritoolid", "pingid", "tumbad"],
  cabinets: ["kapid", "kummutid", "vitriinkapid", "ookapid", "tv-kapid", "seinakapid", "riidekapid"]
} as const;

const ELEMENT_SPEC: Record<MenuElementKey, { slugs: string[]; keywords: string[] }> = {
  sofa: { slugs: ["diivanid", "mooduldiivanid", "nurgadiivanid", "2-kohalised-diivanid", "3-ja-4-kohalised-diivanid"], keywords: ["diivan", "sohva"] },
  "coffee-table": { slugs: ["diivanilauad", "abilauad", "lauad"], keywords: ["diivanilaud", "kohvilaud", "abilaud"] },
  armchair: { slugs: ["tugitoolid", "toolid"], keywords: ["tugitool"] },
  "tv-storage": { slugs: ["tv-kapid", "kapid", ...MENU_SLUGS.shelves], keywords: ["tv-kapp", "tv alus", "meediakapp"] },
  desk: { slugs: ["kirjutuslauad", "konsoollauad"], keywords: ["kirjutuslaud", "töölaud", "arvutilaud", "desk"] },
  "dining-table": { slugs: ["s66gilauad", "lauad"], keywords: ["söögilaud", "soogilaud"] },
  chair: { slugs: ["soogitoolid", "toolid", "baaritoolid", "taburetid"], keywords: ["tool", "istmik", "baaritool", "taburet"] },
  "office-chair": { slugs: ["kontoritoolid"], keywords: ["kontoritool", "office chair"] },
  bed: { slugs: ["voodid-voodipeatsid", "lastetoa-moobel"], keywords: ["voodi", "voodipeats"] },
  nightstand: { slugs: ["ookapid", "kapid"], keywords: ["öökapp", "ookapp"] },
  dresser: { slugs: ["kummutid", "kapid", "konsoollauad"], keywords: ["kummut", "serveerimislaud", "puhvet", "riietumislaud"] },
  shelf: { slugs: [...MENU_SLUGS.shelves, "kummutid", "kapid"], keywords: ["riiul", "riiulikapp", "raamaturiiul", "hoiukas"] },
  "hall-rack": { slugs: ["nagid-redelid"], keywords: ["nagel", "riidepuu"] },
  wardrobe: { slugs: ["riidekapid", "kapid"], keywords: ["riidekapp"] },
  mirror: { slugs: [...MENU_SLUGS.mirrors], keywords: ["peegel"] },
  lamp: { slugs: [...MENU_SLUGS.lighting], keywords: ["lamp", "valgusti"] },
  rug: { slugs: [...MENU_SLUGS.rugs], keywords: ["vaip"] },
  decor: { slugs: [...MENU_SLUGS.decor, "lastetoa-dekoratsioonid-aksessuaarid"], keywords: ["dekor", "aksessuaar", "padi", "seinapilt"] },
  "kitchen-furniture": { slugs: ["kook", "lauad", "s66gilauad", "toolid", "baaritoolid", ...MENU_SLUGS.shelves], keywords: ["köök", "kook", "baaritool", "taburet"] },
  bench: { slugs: ["pingid", "tumbad", "toolid"], keywords: ["pingike", "pink", "tumba"] }
};

const ROOM_MENU_SPEC: Record<string, RoomMenuSpec> = {
  Elutuba: {
    allowedCategorySlugs: ["diivanid", ...MENU_SLUGS.tables, ...MENU_SLUGS.chairs, ...MENU_SLUGS.shelves, "tv-kapid", ...MENU_SLUGS.lighting, ...MENU_SLUGS.rugs, ...MENU_SLUGS.decor],
    elementToSpec: {
      Diivan: "sofa",
      "Kohvilaud": "coffee-table",
      Tugitool: "armchair",
      "TV-alus / riiul": "tv-storage",
      "Lamp / valgusti": "lamp",
      Vaip: "rug",
      "Dekoratiivsed patjad": "decor"
    }
  },
  Magamistuba: {
    allowedCategorySlugs: ["voodid-voodipeatsid", "ookapid", "kummutid", "konsoollauad", ...MENU_SLUGS.mirrors, ...MENU_SLUGS.lighting, ...MENU_SLUGS.rugs, ...MENU_SLUGS.decor],
    elementToSpec: {
      Voodi: "bed",
      Öökapp: "nightstand",
      "Kummut / riietumislaud": "dresser",
      Peegel: "mirror",
      "Lamp / valgusti": "lamp",
      Vaip: "rug"
    }
  },
  Söögituba: {
    allowedCategorySlugs: ["s66gilauad", "lauad", "soogitoolid", "toolid", "kummutid", "vitriinkapid", "konsoollauad", "kapid", ...MENU_SLUGS.lighting, ...MENU_SLUGS.rugs],
    elementToSpec: {
      Söögilaud: "dining-table",
      Söögitoolid: "chair",
      "Puhvet / serveerimislaud": "dresser",
      "Pendel / lamp": "lamp",
      Vaip: "rug"
    }
  },
  Köök: {
    allowedCategorySlugs: ["kook", "lauad", "s66gilauad", "toolid", "baaritoolid", "taburetid", ...MENU_SLUGS.shelves, ...MENU_SLUGS.lighting],
    elementToSpec: {
      Köögimööbel: "kitchen-furniture",
      "Baaritool / taburet": "chair",
      "Riiul / hoidik": "shelf",
      "Lamp / valgusti": "lamp"
    }
  },
  Kontor: {
    allowedCategorySlugs: ["kirjutuslauad", "konsoollauad", "kontoritoolid", ...MENU_SLUGS.shelves, "kapid", "kummutid", ...MENU_SLUGS.lighting, ...MENU_SLUGS.rugs, ...MENU_SLUGS.decor],
    excludedCategorySlugs: [
      "diivanilauad",
      "abilauad",
      "s66gilauad",
      "terrassi-lauad",
      "diivanid",
      "mooduldiivanid",
      "nurgadiivanid",
      "2-kohalised-diivanid",
      "3-ja-4-kohalised-diivanid",
      "tugitoolid",
      "soogitoolid",
      "baaritoolid",
      "taburetid"
    ],
    elementToSpec: {
      "Kirjutuslaud / töölaud": "desk",
      Kontoritool: "office-chair",
      Riiulikapp: "shelf",
      Lamp: "lamp",
      "Aksessuaarid / dekor": "decor"
    }
  },
  Lastetuba: {
    allowedCategorySlugs: ["lastetuba", "lastetoa-moobel", "voodid-voodipeatsid", "kirjutuslauad", "lauad", "toolid", "tumbad", ...MENU_SLUGS.shelves, "korvid-ja-hoiukastid", "lastetoa-valgustid", "lastetoa-vaibad", ...MENU_SLUGS.decor],
    elementToSpec: {
      "Lastemööbel / voodi": "bed",
      "Laud / töölaud": "desk",
      "Tool / istmik": "chair",
      "Riiul / hoiukas": "shelf",
      Lamp: "lamp",
      Vaip: "rug"
    }
  },
  Esik: {
    allowedCategorySlugs: ["riidekapid", "kapid", "nagid-redelid", ...MENU_SLUGS.shelves, ...MENU_SLUGS.mirrors, "pingid", "tumbad", ...MENU_SLUGS.lighting, ...MENU_SLUGS.rugs],
    elementToSpec: {
      Riidekapp: "wardrobe",
      "Nagel / riidepuu": "hall-rack",
      Jalatsiriiul: "shelf",
      Peegel: "mirror",
      "Pingike / tool": "bench"
    }
  }
};

const buildSearchableText = (product: CatalogProductRaw): string =>
  normalizeForMatch(
    [product.title, ...product.categories, ...(product.categorySlugs ?? []), product.description].join(" ")
  );

const hasAnySlug = (product: CatalogProductRaw, slugs: Set<string>): boolean =>
  (product.categorySlugs ?? []).some((slug) => slugs.has(slug));

const shouldExcludeProduct = (
  product: CatalogProductRaw,
  excludedSlugs: Set<string>,
  protectedSlugs: Set<string>
): boolean => {
  if (excludedSlugs.size === 0) return false;
  if (!hasAnySlug(product, excludedSlugs)) return false;
  if (protectedSlugs.size > 0 && hasAnySlug(product, protectedSlugs)) return false;
  return true;
};

const inferSpecKeyFromText = (rawText: string): MenuElementKey | null => {
  const text = normalizeForMatch(rawText);
  if (!text) return null;
  if (text.includes("kirjutuslaud") || text.includes("toolaud") || text.includes("arvutilaud")) return "desk";
  if (text.includes("kontoritool")) return "office-chair";
  if (text.includes("soogilaud")) return "dining-table";
  if (text.includes("diivanilaud") || text.includes("kohvilaud") || text.includes("abilaud")) return "coffee-table";
  if (text.includes("diivan") || text.includes("sohva")) return "sofa";
  if (text.includes("tugitool")) return "armchair";
  if (text.includes("ookapp")) return "nightstand";
  if (text.includes("kummut") || text.includes("puhvet") || text.includes("riietumislaud")) return "dresser";
  if (text.includes("riidekapp")) return "wardrobe";
  if (text.includes("riiul")) return "shelf";
  if (text.includes("nagel") || text.includes("riidepuu")) return "hall-rack";
  if (text.includes("peegel")) return "mirror";
  if (text.includes("lamp") || text.includes("valgusti") || text.includes("pendel")) return "lamp";
  if (text.includes("vaip")) return "rug";
  if (text.includes("dekor") || text.includes("aksessuaar")) return "decor";
  if (text.includes("koogimoobel") || text.includes("kook")) return "kitchen-furniture";
  if (text.includes("pingike") || text.includes("pink") || text.includes("tumba")) return "bench";
  if (text.includes("voodi")) return "bed";
  if (text.includes("tool")) return "chair";
  return null;
};

const inferSpecKeyFromRawProduct = (product: CatalogProductRaw): MenuElementKey | null =>
  inferSpecKeyFromText([product.title, ...product.categories, ...(product.categorySlugs ?? []), product.description].join(" "));

const isMenuElementKey = (value: string): value is MenuElementKey =>
  Object.prototype.hasOwnProperty.call(ELEMENT_SPEC, value);

interface SelectedElementSpec {
  element: string;
  specKey: MenuElementKey;
  spec: { slugs: string[]; keywords: string[] };
}

const ACCESSORY_SPEC_KEYS = new Set<MenuElementKey>(["lamp", "rug", "decor", "mirror"]);

const MAX_ALTERNATIVES_PER_ITEM = 4;
const BEDROOM_BED_BLOCKED_SLUGS = new Set([
  "diivanid",
  "diivanvoodid",
  "2-kohalised-diivanid",
  "3-ja-4-kohalised-diivanid",
  "lamamistoolid",
  "aed-terrass"
]);
const BEDROOM_BED_BLOCKED_TERMS = ["diivanvoodi", "paevavoodi", "lamamistool", "sunbed", "daybed"] as const;
const BEDROOM_BED_REQUIRED_TERMS = ["voodi", "voodipeats"] as const;

const isUnsuitableBedroomBedProduct = (product: CatalogProductRaw): boolean => {
  if (hasAnySlug(product, BEDROOM_BED_BLOCKED_SLUGS)) return true;
  const searchable = buildSearchableText(product);
  return BEDROOM_BED_BLOCKED_TERMS.some((term) => searchable.includes(term));
};

const isStrictBedroomBedProduct = (product: CatalogProductRaw): boolean => {
  if (isUnsuitableBedroomBedProduct(product)) return false;
  const normalizedTitle = normalizeForMatch(product.title ?? "");
  return BEDROOM_BED_REQUIRED_TERMS.some((term) => normalizedTitle.includes(term));
};

const ensureAnchorSpecInSelection = (
  specs: SelectedElementSpec[],
  answers: BundleAnswers
): SelectedElementSpec[] => {
  const anchorSpecKey = inferSpecKeyFromText(answers.anchorProduct ?? "");
  if (!anchorSpecKey) return specs;
  if (specs.some((spec) => spec.specKey === anchorSpecKey)) return specs;

  const anchorSpec = ELEMENT_SPEC[anchorSpecKey];
  if (!anchorSpec) return specs;

  return [{ element: answers.anchorProduct || "Ankurtoode", specKey: anchorSpecKey, spec: anchorSpec }, ...specs];
};

const resolveSelectedElementSpecs = (answers: BundleAnswers): SelectedElementSpec[] => {
  const roomSpec = ROOM_MENU_SPEC[answers.room];
  if (!roomSpec) return [];

  const selected = (answers.selectedElements ?? []).length
    ? answers.selectedElements
    : Object.keys(roomSpec.elementToSpec);

  return selected
    .map((element) => {
      const specKey = roomSpec.elementToSpec[element] ?? inferSpecKeyFromText(element);
      if (!specKey) return null;
      const spec = ELEMENT_SPEC[specKey];
      if (!spec) return null;
      return { element, specKey, spec };
    })
    .filter((value): value is SelectedElementSpec => value !== null);
};

const rankCandidatesForSpec = (
  catalog: CatalogProductRaw[],
  spec: { slugs: string[]; keywords: string[] },
  answers: BundleAnswers,
  specKey?: MenuElementKey
): ProductCard[] => {
  const specSlugs = new Set(spec.slugs);
  const specKeywords = spec.keywords.map((keyword) => normalizeForMatch(keyword));
  const bedPreferredSlugs = new Set(["voodid-voodipeatsid"]);

  return catalog
    .map((product) => {
      if (specKey === "bed" && answers.room === "Magamistuba" && !isStrictBedroomBedProduct(product)) {
        return null;
      }

      const searchable = buildSearchableText(product);
      const slugMatch = specSlugs.size > 0 && hasAnySlug(product, specSlugs);
      const keywordMatch = specKeywords.some((keyword) => searchable.includes(keyword));
      if (!slugMatch && !keywordMatch) return null;

      const card = toProductCard(product);
      let score = scoreCatalogProduct(card, answers);
      if (slugMatch) score += 28;
      if (keywordMatch) score += 10;
      if (normalizeForMatch(card.title).includes("defektiga")) score -= 4;

      // Bedroom anchor should prefer real bed products over sofa/outdoor variants.
      if (specKey === "bed") {
        if (hasAnySlug(product, bedPreferredSlugs)) score += 20;
        if (searchable.includes("diivanvoodi")) score -= 7;
      }

      return { card, score };
    })
    .filter((value): value is { card: ProductCard; score: number } => value !== null)
    .sort((a, b) => b.score - a.score)
    .map((value) => value.card);
};

const bundleSignature = (bundle: Bundle): string =>
  bundle.items
    .map((item) => item.id)
    .sort((a, b) => a.localeCompare(b))
    .join("|");

function rankAlternativesForItem(
  item: BundleItem,
  bundleItemIds: Set<string>,
  filteredCatalog: CatalogProductRaw[],
  catalogById: Map<string, CatalogProductRaw>,
  answers: BundleAnswers
): ProductCard[] {
  const currentRaw = catalogById.get(item.id);
  const explicitSpecKey = item.specKey && isMenuElementKey(item.specKey) ? item.specKey : null;
  const inferredCurrentSpecKey =
    currentRaw
      ? inferSpecKeyFromRawProduct(currentRaw)
      : inferSpecKeyFromText([item.title, ...(item.categoryNames ?? [])].join(" "));
  const anchorSpecKey = inferSpecKeyFromText(answers.anchorProduct ?? "");
  const resolvedSpecKey =
    explicitSpecKey ??
    inferredCurrentSpecKey ??
    (item.roleInBundle === "ankur" ? anchorSpecKey : null);
  const resolvedSpec = resolvedSpecKey ? ELEMENT_SPEC[resolvedSpecKey] : null;
  const resolvedSpecSlugs = new Set(resolvedSpec?.slugs ?? []);
  const resolvedSpecKeywords = (resolvedSpec?.keywords ?? []).map((kw) => normalizeForMatch(kw));
  const basePrice = parseDisplayPrice(item.price);

  const ranked = filteredCatalog
    .filter((candidate) => candidate.id !== item.id)
    .filter((candidate) => !bundleItemIds.has(candidate.id))
    .map((candidate) => {
      if (resolvedSpecKey === "bed" && answers.room === "Magamistuba" && !isStrictBedroomBedProduct(candidate)) {
        return null;
      }

      const searchable = buildSearchableText(candidate);
      const candidateSpecKey = inferSpecKeyFromRawProduct(candidate);
      const isAccessoryCandidate = candidateSpecKey !== null && ACCESSORY_SPEC_KEYS.has(candidateSpecKey);
      const roleCompatible =
        item.roleInBundle === "aksessuaar"
          ? isAccessoryCandidate || (candidateSpecKey !== null && resolvedSpecKey === candidateSpecKey)
          : !isAccessoryCandidate || (candidateSpecKey !== null && resolvedSpecKey === candidateSpecKey);

      if (!roleCompatible) return null;

      const slugOverlapCount =
        resolvedSpecSlugs.size > 0
          ? (candidate.categorySlugs ?? []).filter((slug) => resolvedSpecSlugs.has(slug)).length
          : 0;
      const keywordMatch = resolvedSpecKeywords.some((kw) => searchable.includes(kw));
      const sameSpec = resolvedSpecKey !== null && candidateSpecKey === resolvedSpecKey;

      const card = toProductCard(candidate);
      let score = scoreCatalogProduct(card, answers);

      if (resolvedSpecKey) {
        if (sameSpec) score += 42;
        if (slugOverlapCount > 0) score += slugOverlapCount * 15;
        if (keywordMatch) score += 12;
        if (!sameSpec && slugOverlapCount === 0 && !keywordMatch) score -= 38;
      }

      if (item.roleInBundle === "ankur") score += 8;
      if (normalizeForMatch(card.title).includes("defektiga")) score -= 5;

      if (basePrice > 0) {
        const priceDiffRatio = Math.abs(candidate.price - basePrice) / basePrice;
        score += Math.max(0, 10 - priceDiffRatio * 25);
      }

      return { card, score };
    })
    .filter((value): value is { card: ProductCard; score: number } => value !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ALTERNATIVES_PER_ITEM)
    .map((value) => value.card);

  return ranked;
}

function attachAlternativesToBundles(
  bundles: Bundle[],
  filteredCatalog: CatalogProductRaw[],
  catalogById: Map<string, CatalogProductRaw>,
  answers: BundleAnswers
): Bundle[] {
  return bundles.map((bundle) => {
    const bundleItemIds = new Set(bundle.items.map((item) => item.id));
    const items = bundle.items.map((item) => ({
      ...item,
      alternatives: rankAlternativesForItem(item, bundleItemIds, filteredCatalog, catalogById, answers)
    }));

    const totalPrice = items.reduce((sum, current) => sum + parseDisplayPrice(current.price), 0);
    return { ...bundle, items, totalPrice };
  });
}

function buildStrictBundleFromSelections(
  catalog: CatalogProductRaw[],
  rawCatalog: CatalogProductRaw[],
  answers: BundleAnswers
): Bundle | null {
  const selectedSpecs = ensureAnchorSpecInSelection(resolveSelectedElementSpecs(answers), answers);
  if (!selectedSpecs.length) return null;

  const anchorSpecKey = inferSpecKeyFromText(answers.anchorProduct) ?? selectedSpecs[0]?.specKey ?? null;
  const normalizedAnchor = normalizeForMatch(answers.anchorProduct ?? "");

  const usedIds = new Set<string>();
  const items: BundleItem[] = [];
  const missingElements: string[] = [];
  let anchorAssigned = false;

  for (const selected of selectedSpecs) {
    const candidates = rankCandidatesForSpec(catalog, selected.spec, answers, selected.specKey);
    let picked = candidates.find((candidate) => !usedIds.has(candidate.id));

    if (!picked) {
      const focusedCatalog = filterByRoom(rawCatalog, answers.room, [selected.element], answers.anchorProduct ?? "");
      const focusedCandidates = rankCandidatesForSpec(focusedCatalog, selected.spec, answers, selected.specKey);
      picked = focusedCandidates.find((candidate) => !usedIds.has(candidate.id));
    }

    if (!picked) {
      missingElements.push(selected.element);
      continue;
    }

    usedIds.add(picked.id);

    const normalizedElement = normalizeForMatch(selected.element);
    const isAnchorElement =
      !anchorAssigned &&
      ((anchorSpecKey !== null && selected.specKey === anchorSpecKey) ||
        (normalizedAnchor.length > 0 && normalizedElement.includes(normalizedAnchor)));

    let role: BundleItem["roleInBundle"] = ACCESSORY_SPEC_KEYS.has(selected.specKey) ? "aksessuaar" : "lisatoode";
    let whyChosen = `Valitud elemendi "${selected.element}" jaoks sobiv toode.`;

    if (isAnchorElement) {
      role = "ankur";
      whyChosen = `Valitud ankurtoote "${answers.anchorProduct}" põhjal valitud põhitoode.`;
      anchorAssigned = true;
    } else if (role === "aksessuaar") {
      whyChosen = `Viimistleb valitud elementi "${selected.element}".`;
    }

    items.push({
      ...picked,
      roleInBundle: role,
      whyChosen,
      specKey: selected.specKey
    });
  }

  if (!items.length) return null;

  if (!anchorAssigned && anchorSpecKey === null) {
    const fallbackAnchorIndex = items.findIndex((item) => item.roleInBundle === "lisatoode");
    const anchorIndex = fallbackAnchorIndex >= 0 ? fallbackAnchorIndex : 0;
    items[anchorIndex] = {
      ...items[anchorIndex],
      roleInBundle: "ankur",
      whyChosen: "Automaatselt valitud põhitoode."
    };
  }

  const totalPrice = items.reduce((sum, current) => sum + parseDisplayPrice(current.price), 0);

  const keyReasons = [
    `Sisaldab ${items.length}/${selectedSpecs.length} valitud elementi`,
    `Ankur: ${answers.anchorProduct || "automaatne"}`,
    `Sobib ${answers.room.toLowerCase()}`
  ];

  const tradeoffs: string[] = [];
  if (missingElements.length > 0) {
    tradeoffs.push(`Kataloogis ei leidunud valitud elementidele sobivaid tooteid: ${missingElements.join(", ")}.`);
  }
  if (!anchorAssigned && anchorSpecKey !== null) {
    tradeoffs.push(`Valitud ankurtootele "${answers.anchorProduct}" ei leitud sobivat toodet.`);
  }

  return {
    title: `${answers.room} valikukomplekt`,
    styleSummary: `${answers.colorTone.toLowerCase()} toonid. Koostatud sinu valitud elementide järgi.`,
    totalPrice,
    items,
    keyReasons,
    tradeoffs
  };
}

function filterByRoom(
  catalog: CatalogProductRaw[],
  room: string,
  selectedElements: string[] = [],
  anchorProduct = ""
): CatalogProductRaw[] {
  const roomKeywords = ROOM_CATEGORIES[room] ?? [];
  const roomSpec = ROOM_MENU_SPEC[room];
  if (!roomSpec) return catalog.slice(0, 80);

  const allowedRoomSlugs = new Set(roomSpec.allowedCategorySlugs);
  const excludedRoomSlugs = new Set(roomSpec.excludedCategorySlugs ?? []);

  const elementSpecs = selectedElements
    .map((element) => {
      const key = roomSpec.elementToSpec[element];
      if (!key) return null;
      const spec = ELEMENT_SPEC[key];
      return spec ? { element, ...spec } : null;
    })
    .filter((value): value is { element: string; slugs: string[]; keywords: string[] } => value !== null);

  const selectedElementSlugs = new Set(elementSpecs.flatMap((spec) => spec.slugs));
  const selectedElementKeywords = [...new Set(elementSpecs.flatMap((spec) => spec.keywords.map((kw) => normalizeForMatch(kw))))];

  const anchorKey = inferSpecKeyFromText(anchorProduct);
  const anchorSpec = anchorKey ? ELEMENT_SPEC[anchorKey] : null;
  const anchorSlugs = new Set(anchorSpec?.slugs ?? []);
  const anchorKeywords = (anchorSpec?.keywords ?? []).map((kw) => normalizeForMatch(kw));
  const protectedSlugs = new Set([...allowedRoomSlugs, ...selectedElementSlugs, ...anchorSlugs]);

  const anchorStrong = catalog.filter((product) => {
    if (!anchorSpec) return false;
    if (shouldExcludeProduct(product, excludedRoomSlugs, protectedSlugs)) return false;
    const searchable = buildSearchableText(product);
    if (anchorSlugs.size > 0 && hasAnySlug(product, anchorSlugs)) return true;
    return anchorKeywords.some((kw) => searchable.includes(kw));
  });

  // Keep explicit per-element candidates near the top so each selected room element
  // has a realistic chance to be represented in the AI input list.
  const elementFocused = elementSpecs.flatMap((spec) => {
    const specSlugs = new Set(spec.slugs);
    const specKeywords = spec.keywords.map((kw) => normalizeForMatch(kw));
    return catalog
      .filter((product) => {
        if (shouldExcludeProduct(product, excludedRoomSlugs, protectedSlugs)) return false;
        const searchable = buildSearchableText(product);
        if (specSlugs.size > 0 && hasAnySlug(product, specSlugs)) return true;
        return specKeywords.some((kw) => searchable.includes(kw));
      })
      .slice(0, 16);
  });

  // 1) Strong element-level matches by menu slugs (preferred) or element keywords (fallback).
  const elementStrong = catalog.filter((product) => {
    if (shouldExcludeProduct(product, excludedRoomSlugs, protectedSlugs)) return false;
    const searchable = buildSearchableText(product);
    if (selectedElementSlugs.size > 0 && hasAnySlug(product, selectedElementSlugs)) return true;
    return selectedElementKeywords.some((kw) => searchable.includes(kw));
  });

  // 2) Room-level menu scope to avoid wrong furniture families (e.g. office -> desk families, not sofa tables).
  const roomScoped = catalog.filter((product) => {
    if (shouldExcludeProduct(product, excludedRoomSlugs, protectedSlugs)) return false;
    return hasAnySlug(product, allowedRoomSlugs);
  });

  // 3) Safety fallback: previous keyword-based room matching.
  const keywordFallback = catalog.filter((product) => {
    if (shouldExcludeProduct(product, excludedRoomSlugs, protectedSlugs)) return false;
    const searchable = buildSearchableText(product);
    return roomKeywords.some((kw) => searchable.includes(normalizeForMatch(kw)));
  });

  const ordered = [...anchorStrong, ...elementFocused, ...elementStrong, ...roomScoped, ...keywordFallback];
  const seen = new Set<string>();
  const deduped: CatalogProductRaw[] = [];
  for (const product of ordered) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    deduped.push(product);
  }

  if (deduped.length < 5) return catalog.slice(0, 80);
  return deduped.slice(0, 80);
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
    const slotKeywords = slot.keywords.map((keyword) => normalizeForMatch(keyword));
    let candidates = filtered.filter((p) => {
      if (!slotKeywords.length) return true;
      const searchable = buildSearchableText(p);
      return slotKeywords.some((kw) => searchable.includes(kw));
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

      // If the index-based variation misses (e.g. only 1 desk exists), keep role consistency
      // by reusing the top role-matched candidate instead of falling to a random room item.
      if (!picked && candidates.length > 0) {
        picked = candidates.find((candidate) => !usedIds.has(candidate.id)) ?? candidates[0];
      }

      if (!picked && slot.required) {
        const fallback = filtered.find((p) => !usedIds.has(p.id));
        if (fallback) picked = toProductCard(fallback);
      }
      if (picked) {
        const slotSpecKey =
          inferSpecKeyFromText(slot.keywords.join(" ")) ??
          inferSpecKeyFromText([picked.title, ...(picked.categoryNames ?? [])].join(" "));
        usedIds.add(picked.id);
        items.push({
          ...picked,
          roleInBundle: slot.role,
          whyChosen: slot.role === "ankur" ? "Komplekti põhitoode" : slot.role === "lisatoode" ? "Täiendab põhitoodet" : "Viimistleb ruumi",
          specKey: slotSpecKey ?? undefined
        });
      }
    }
    if (!items.length) continue;
    const totalPrice = items.reduce((sum, current) => sum + parseDisplayPrice(current.price), 0);
    bundles.push({
      title: `Komplekt ${i + 1}`,
      styleSummary: `${answers.colorTone.toLowerCase()} toonid`,
      totalPrice,
      items,
      keyReasons: [
        `Sobib ${answers.room.toLowerCase()}`,
        `Eelarve kuni ${budgetMax}€`,
        answers.hasChildren || answers.hasPets ? "Vastupidavad materjalid" : `${answers.room} komplekt`
      ],
      tradeoffs: totalPrice > budgetMax ? [`Koguhind ületab eelarve ${(totalPrice - budgetMax).toFixed(0)}€ võrra`] : []
    });
  }
  return bundles;
}

export async function generateBundles(answers: BundleAnswers): Promise<Bundle[]> {
  const rawCatalog = (await fetchProductCatalog()) as unknown as CatalogProductRaw[];
  const filtered = filterByRoom(
    rawCatalog,
    answers.room,
    answers.selectedElements ?? [],
    answers.anchorProduct ?? ""
  );
  const strictBundle = buildStrictBundleFromSelections(filtered, rawCatalog, answers);

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
              .map((ai): BundleItem | null => {
                const raw = catalogById.get(ai.id);
                if (!raw) return null;
                const inferredSpecKey = inferSpecKeyFromRawProduct(raw);
                return {
                  ...toProductCard(raw),
                  roleInBundle: ai.roleInBundle,
                  whyChosen: ai.whyChosen,
                  specKey: inferredSpecKey ?? undefined
                };
              })
              .filter((x): x is BundleItem => x !== null);

            if (!items.length) return null;
            const totalPrice = items.reduce(
              (sum, current) => sum + parseDisplayPrice(current.price), 0
            );
            return { title: ab.title, styleSummary: ab.styleSummary, totalPrice, items, keyReasons: ab.keyReasons, tradeoffs: ab.tradeoffs };
          })
          .filter((b): b is Bundle => b !== null);

        if (result.length > 0) {
          if (!strictBundle) {
            return attachAlternativesToBundles(result, filtered, catalogById, answers);
          }
          const strictSig = bundleSignature(strictBundle);
          const merged = [strictBundle, ...result.filter((bundle) => bundleSignature(bundle) !== strictSig)];
          return attachAlternativesToBundles(merged.slice(0, 3), filtered, catalogById, answers);
        }
      }
    } catch (err) {
      console.error("[generateBundles] AI selection failed, falling back to scoring:", err);
    }
  }

  // Fallback: scoring-based selection (no OpenAI key or AI call failed)
  const scored = buildBundlesByScoring(filtered, answers);
  if (strictBundle) {
    return attachAlternativesToBundles([strictBundle], filtered, catalogById, answers);
  }
  return attachAlternativesToBundles(scored, filtered, catalogById, answers);
}
