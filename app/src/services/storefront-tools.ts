import { commerceConfig, faqEntries } from "../config/policies.js";
import { cache } from "../lib/cache.js";
import {
  fetchAllWooProductCategories,
  fetchWooProductById,
  fetchWooProductBySlug,
  fetchWooProducts,
  type WooProduct,
  type WooProductCategoryNode
} from "../lib/woocommerce.js";
import type { ProductCard } from "../types/chat.js";
import { generateProductSearchQueries } from "./llm.js";
import { hasSimulatorModelMatch } from "./simulator-models.js";

const CATALOG_CACHE_KEY = "woo_product_catalog";
const CATALOG_TTL = 5 * 60_000;
const MAX_CATALOG_PRODUCTS = 1200;
const CATEGORY_TREE_CACHE_KEY = "woo_product_category_tree";
const CATEGORY_TREE_TTL = 10 * 60_000;

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#038;/gi, "&")
    .replace(/&#8211;/gi, "-")
    .replace(/&#8220;|&#8221;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

const formatMoney = (raw: string | number | undefined, minorUnit = 2, symbol = "€") => {
  const amount = Number(raw ?? 0) / 10 ** minorUnit;
  return `${amount.toFixed(2)}${symbol}`;
};

const parseCardPrice = (formattedPrice: string): number => {
  const normalized = formattedPrice.replace(/[^0-9.,]/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
};

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PRODUCT_STOP_WORDS = new Set([
  "tahan",
  "soovita",
  "soovin",
  "otsin",
  "vajan",
  "mul",
  "mulle",
  "teil",
  "on",
  "oleks",
  "umbes",
  "vahel",
  "seina",
  "sein",
  "teise",
  "ruumi",
  "vaba",
  "kui",
  "kus",
  "mis",
  "milline",
  "milliseid",
  "valikuid",
  "palju",
  "saaks",
  "jaoks",
  "sisse",
  "laius",
  "lai",
  "kirjutada",
  "laia",
  "palun",
  "mingit",
  "mingi",
  "kas",
  "et",
  "ja",
  "voi",
  "alla",
  "ule",
  "uleks",
  "vahemalt",
  "alates",
  "max",
  "min",
  "kuni",
  "eur",
  "euro",
  "eurot",
  "hind",
  "hinnaga",
  "tahtsin",
  "peaks",
  "meetri",
  "meetrit",
  "meeter",
  "meetrine",
  "m"
]);

interface DimensionProfile {
  all: number[];
  widthCandidates: number[];
  lengthCandidates: number[];
  maxDimension: number | null;
}

const uniqueSorted = (values: number[]): number[] =>
  [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);

const parseDimensionProfile = (value: string): DimensionProfile => {
  const numbers: number[] = [];
  const widthCandidates: number[] = [];
  const lengthCandidates: number[] = [];

  const crossMatches = [...value.matchAll(/(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{2,3}))?/gi)];
  for (const match of crossMatches) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = match[3] ? Number(match[3]) : NaN;

    for (const num of [first, second, third]) {
      if (Number.isFinite(num)) numbers.push(num);
    }

    if (Number.isFinite(first) && Number.isFinite(second)) {
      // Most furniture titles use LxWxH; keep both tolerant options for width/length filters.
      widthCandidates.push(Math.min(first, second), second);
      lengthCandidates.push(Math.max(first, second), first);
    }
  }

  const diameterMatches = [...value.matchAll(/(?:ø|⌀|o)\s*(\d{2,3})(?:\s*cm)?/gi)];
  for (const match of diameterMatches) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
      widthCandidates.push(parsed);
      lengthCandidates.push(parsed);
    }
  }

  const cmMatches = [...value.matchAll(/(\d{2,3})\s*cm\b/gi)];
  for (const match of cmMatches) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) numbers.push(parsed);
  }

  const all = uniqueSorted(numbers);

  return {
    all,
    widthCandidates: uniqueSorted(widthCandidates),
    lengthCandidates: uniqueSorted(lengthCandidates),
    maxDimension: all.length ? Math.max(...all) : null
  };
};

const canonicalizeToken = (token: string): string => {
  if (/^(laud|laua|lauda|lauale|laudne)/.test(token)) return "laud";
  if (/^(kirjutuslaud|kirjutus)/.test(token)) return "laud";
  if (/^(ookapp|oo|ookapi|ookappi|ookap)/.test(token)) return "ookapp";
  if (/^(tvkapp|tv)/.test(token)) return "tvkapp";
  if (/^(vitriinkapp|vitriin)/.test(token)) return "vitriinkapp";
  if (/^(riiul|raamaturiiul|seinariiul)/.test(token)) return "riiul";
  if (/^(kummut)/.test(token)) return "kummut";
  if (/^(diivan)/.test(token)) return "diivan";
  if (/^(kontor|office)/.test(token)) return "kontor";
  if (/tool/.test(token) || /^(tooli|toole|toolid|toolid)$/.test(token)) return "tool";
  if (/^(valgust|lamp)/.test(token)) return "valgusti";
  if (/^(vaip)/.test(token)) return "vaip";
  if (/^(peegel)/.test(token)) return "peegel";
  if (/^(meetri|meetrit|meeter|meetrine)$/.test(token)) return "meeter";
  return token;
};

const extractQueryTokens = (query: string): string[] => {
  const rawTokens = normalizeForMatch(query)
    .split(" ")
    .map((token) => canonicalizeToken(token))
    .filter((token) => token.length >= 3)
    .filter((token) => !PRODUCT_STOP_WORDS.has(token));

  return [...new Set(rawTokens)];
};

type QueryType =
  | "ookapp"
  | "tvkapp"
  | "vitriinkapp"
  | "riiul"
  | "kummut"
  | "laud"
  | "tool"
  | "diivan"
  | "voodi"
  | "valgusti"
  | "vaip"
  | "peegel"
  | null;
type DimensionAxis = "any" | "width" | "length";

interface QuerySemantics {
  normalizedQuery: string;
  smallPreferred: boolean;
  requiredType: QueryType;
  requiredAliases: string[];
  excludedAliases: string[];
  dimensionMaxCm?: number;
  dimensionMinCm?: number;
  hasDimensionRequest: boolean;
  dimensionAxis: DimensionAxis;
}

const parseDimensionConstraint = (normalized: string): {
  dimensionMaxCm?: number;
  dimensionMinCm?: number;
  hasDimensionRequest: boolean;
} => {
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(m|meetrit|meetri|meeter|cm)\b/i);
  if (!match) {
    return { hasDimensionRequest: false };
  }

  const rawValue = Number(match[1].replace(",", "."));
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return { hasDimensionRequest: false };
  }

  const unit = match[2];
  const valueCm = unit === "cm" ? rawValue : rawValue * 100;

  const hasMaxSignal =
    /\bkuni\b|\balla\b|\bmax\b|\bsisse\b|\bmahub\b|\bvaba ruum\b|\bvaba ruumi\b|\bseina vahel\b|\bvahel\b/.test(
      normalized
    );
  const hasMinSignal = /\bvahemalt\b|\balates\b|\bmin\b|\brohkem\b|\bsuurem\b/.test(normalized);

  if (hasMaxSignal && !hasMinSignal) {
    return { dimensionMaxCm: valueCm, hasDimensionRequest: true };
  }

  if (hasMinSignal && !hasMaxSignal) {
    return { dimensionMinCm: valueCm, hasDimensionRequest: true };
  }

  if (hasMaxSignal && hasMinSignal) {
    if (/\bsisse\b|\bkuni\b|\balla\b|\bmax\b|\bmahub\b/.test(normalized)) {
      return { dimensionMaxCm: valueCm, hasDimensionRequest: true };
    }
    return { dimensionMinCm: valueCm, hasDimensionRequest: true };
  }

  if (/\bruum\b/.test(normalized)) {
    return { dimensionMaxCm: valueCm, hasDimensionRequest: true };
  }

  return { hasDimensionRequest: true, dimensionMaxCm: valueCm };
};

const detectDimensionAxis = (normalized: string): DimensionAxis => {
  if (/\blai(us|a|ad|ale|une)?\b|\bwidth\b|\bwide\b/.test(normalized)) {
    return "width";
  }

  if (/\bpikk(us|a|ad|ale|une)?\b|\blength\b|\blong\b/.test(normalized)) {
    return "length";
  }

  return "any";
};

const detectQuerySemantics = (query: string): QuerySemantics => {
  const normalized = normalizeForMatch(query);
  const containsAny = (values: string[]) => values.some((value) => normalized.includes(value));
  const dimension = parseDimensionConstraint(normalized);
  const dimensionAxis = detectDimensionAxis(normalized);

  const smallPreferred =
    /\bvaik|\bpisik|\bkompakt|\bkitsa|\bkitsas|\bmadal|\bsmall\b/.test(normalized);

  if (containsAny(["ookapp", "oo kapp", "nightstand"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "ookapp",
      requiredAliases: ["ookapp", "oo kapp", "nightstand", "ookapid"],
      excludedAliases: ["tvkapp", "tv kapp", "vitriinkapp", "raamaturiiul", "seinariiul", "riiul"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["tvkapp", "tv kapp"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "tvkapp",
      requiredAliases: ["tvkapp", "tv kapp"],
      excludedAliases: ["ookapp", "vitriinkapp"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["vitriinkapp"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "vitriinkapp",
      requiredAliases: ["vitriinkapp"],
      excludedAliases: ["ookapp", "tvkapp", "tv kapp"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["kummut"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "kummut",
      requiredAliases: ["kummut"],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["diivan", "sohva", "sofa", "couch"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "diivan",
      requiredAliases: ["diivan", "sohva", "sofa", "couch"],
      excludedAliases: ["tugitool", "chair", "ottoman", "tumba", "pouf"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["voodi", "voodipeats", "bed"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "voodi",
      requiredAliases: ["voodi", "voodipeats", "bed"],
      excludedAliases: ["diivanvoodi", "daybed", "sunbed"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["riiul", "raamaturiiul", "seinariiul"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "riiul",
      requiredAliases: ["riiul", "raamaturiiul", "seinariiul"],
      excludedAliases: ["ookapp", "tvkapp", "tv kapp", "vitriinkapp"],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["laud", "soogilaud", "diivanilaud", "abilaud", "aialaud", "kirjutuslaud", "konsoollaud"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "laud",
      requiredAliases: ["laud", "soogilaud", "diivanilaud", "abilaud", "aialaud", "kirjutuslaud", "konsoollaud"],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["tool", "tugitool", "soogitool", "baaritool", "kontoritool", "office chair", "dining chair", "lounge chair"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "tool",
      requiredAliases: [
        "tool",
        "tugitool",
        "soogitool",
        "baaritool",
        "kontoritool",
        "chair",
        "dining chair",
        "lounge chair"
      ],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["valgusti", "lamp", "light", "lighting"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "valgusti",
      requiredAliases: ["valgusti", "lamp", "light", "lighting"],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["vaip", "rug", "carpet"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "vaip",
      requiredAliases: ["vaip", "rug", "carpet"],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  if (containsAny(["peegel", "mirror"])) {
    return {
      normalizedQuery: normalized,
      smallPreferred,
      requiredType: "peegel",
      requiredAliases: ["peegel", "mirror"],
      excludedAliases: [],
      dimensionAxis,
      ...dimension
    };
  }

  return {
    normalizedQuery: normalized,
    smallPreferred,
    requiredType: null,
    requiredAliases: [],
    excludedAliases: [],
    dimensionAxis,
    ...dimension
  };
};

const buildSimulatorLookupKey = (input: { title: string; handle?: string; categories?: string[] }) =>
  [input.title, input.handle ?? "", ...(input.categories ?? [])].join(" ");

const mapToCard = async (product: WooProduct): Promise<ProductCard> => {
  const price = product.prices;
  const minorUnit = Number(price?.currency_minor_unit ?? 2);
  const currencySymbol = price?.currency_symbol ?? "€";
  const current = Number(price?.price ?? 0) / 10 ** minorUnit;
  const regular = Number(price?.regular_price ?? 0) / 10 ** minorUnit;
  const categories = (product.categories ?? []).map((c) => c.name);
  const simulatorAvailable = await hasSimulatorModelMatch(
    buildSimulatorLookupKey({ title: product.name, handle: product.slug, categories })
  );

  return {
    id: String(product.id),
    title: product.name,
    handle: product.slug,
    image: product.images?.[0]?.src ?? product.images?.[0]?.thumbnail ?? "",
    price: formatMoney(price?.price, minorUnit, currencySymbol),
    compareAtPrice: regular > current ? formatMoney(price?.regular_price, minorUnit, currencySymbol) : undefined,
    reason: "",
    variantId: String(product.id),
    permalink: product.permalink,
    categoryNames: categories,
    simulatorAvailable
  };
};

interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
  categories: string[];
  categorySlugs: string[];
  categoryIds: number[];
  description: string;
  image: string;
  price: number;
  compareAtPrice: number;
  variantId: string;
  permalink: string;
  simulatorAvailable: boolean;
}

export interface CategoryClarificationOption {
  label: string;
  queryToken: string;
  keywords: string[];
  slug: string;
  count: number;
}

export interface CategoryClarificationPlan {
  mainCategoryLabel: string;
  mainCategorySlug: string;
  options: CategoryClarificationOption[];
}

const MAIN_CATEGORY_HINTS: Array<{ mainCategory: string; productTypeHints: string[]; keywords: string[] }> = [
  { mainCategory: "KÖÖK", productTypeHints: [], keywords: ["kook", "koogis", "soogiriist", "lauanoud"] },
  { mainCategory: "KODU AKSESSUAARID", productTypeHints: [], keywords: ["aksessuaar", "dekoratsioon", "sisustusdetail"] },
  { mainCategory: "VALGUSTID", productTypeHints: ["valgusti"], keywords: ["valgusti", "lamp", "laevalgusti", "porandalamp", "lauavalgusti"] },
  { mainCategory: "TOOLID", productTypeHints: ["tool"], keywords: ["tool", "toolid", "chair", "kontoritool", "tugitool", "baaritool", "taburet", "pink", "tumba"] },
  { mainCategory: "LAUAD", productTypeHints: ["laud"], keywords: ["laud", "lauad", "soogilaud", "diivanilaud", "abilaud", "kirjutuslaud", "konsoollaud"] },
  { mainCategory: "RIIULID", productTypeHints: ["riiul"], keywords: ["riiul", "riiulid", "seinariiul", "raamaturiiul"] },
  { mainCategory: "KAPID", productTypeHints: ["kapp", "kummut", "tv-kapp", "öökapp", "vitriinkapp"], keywords: ["kapp", "kapid", "ookapp", "tvkapp", "vitriinkapp", "kummut"] },
  { mainCategory: "DIIVANID", productTypeHints: ["diivan"], keywords: ["diivan", "diivanid", "nurgadiivan", "mooduldiivan", "sohva"] },
  { mainCategory: "NAGID & REDELID", productTypeHints: [], keywords: ["nagi", "nagid", "redel", "redelid"] },
  { mainCategory: "VOODID & VOODIPEATSID", productTypeHints: ["voodi"], keywords: ["voodi", "voodid", "voodipeats", "madrats"] },
  { mainCategory: "PEEGLID", productTypeHints: ["peegel"], keywords: ["peegel", "peeglid"] },
  { mainCategory: "VAIBAD", productTypeHints: ["vaip"], keywords: ["vaip", "vaibad"] },
  { mainCategory: "VANNITUBA", productTypeHints: [], keywords: ["vannituba", "vannitoa"] },
  { mainCategory: "LASTETUBA", productTypeHints: [], keywords: ["lastetuba", "laste", "lastetoa"] },
  { mainCategory: "AED & TERRASS", productTypeHints: ["aiamööbel"], keywords: ["aed", "terrass", "oue", "aiamoobel", "aiamööbel"] }
];

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&#038;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

const fetchStoreCategoryTree = async (): Promise<WooProductCategoryNode[]> => {
  const cached = cache.get<WooProductCategoryNode[]>(CATEGORY_TREE_CACHE_KEY);
  if (cached) return cached;

  try {
    const categories = await fetchAllWooProductCategories({ hideEmpty: true, maxPages: 25 });
    cache.set(CATEGORY_TREE_CACHE_KEY, categories, CATEGORY_TREE_TTL);
    return categories;
  } catch (error) {
    console.error("[fetchStoreCategoryTree] error:", error);
    return [];
  }
};

const matchCategoryByLabel = (
  categories: WooProductCategoryNode[],
  label: string
): WooProductCategoryNode | null => {
  const normalizedLabel = normalizeForMatch(label);
  return (
    categories.find((category) => normalizeForMatch(decodeHtmlEntities(category.name)) === normalizedLabel) ??
    categories.find((category) => normalizeForMatch(decodeHtmlEntities(category.name)).includes(normalizedLabel)) ??
    null
  );
};

const detectMainCategoryLabel = (
  normalizedQuery: string,
  productTypes: string[],
  categories: WooProductCategoryNode[]
): string | null => {
  for (const hint of MAIN_CATEGORY_HINTS) {
    if (hint.productTypeHints.some((value) => productTypes.includes(normalizeForMatch(value)))) {
      return hint.mainCategory;
    }
  }

  for (const hint of MAIN_CATEGORY_HINTS) {
    if (hint.keywords.some((keyword) => normalizedQuery.includes(normalizeForMatch(keyword)))) {
      return hint.mainCategory;
    }
  }

  const directMatch = categories.find((category) => {
    const normalizedName = normalizeForMatch(decodeHtmlEntities(category.name));
    if (!normalizedName || normalizedName.length < 3) return false;
    return normalizedQuery.includes(normalizedName);
  });

  return directMatch ? decodeHtmlEntities(directMatch.name) : null;
};

export const planCategoryClarification = async (input: {
  query: string;
  productTypes?: string[];
}): Promise<CategoryClarificationPlan | null> => {
  const categories = await fetchStoreCategoryTree();
  if (!categories.length) return null;

  const categoriesWithChildren = categories.filter((category) => {
    if ((category.count ?? 0) <= 0) return false;
    return categories.some((child) => child.parent === category.id && (child.count ?? 0) > 0);
  });
  if (!categoriesWithChildren.length) return null;

  const normalizedQuery = normalizeForMatch(input.query);
  const productTypes = (input.productTypes ?? []).map((type) => normalizeForMatch(type));
  const targetLabel = detectMainCategoryLabel(normalizedQuery, productTypes, categoriesWithChildren);
  if (!targetLabel) return null;

  const mainCategory = matchCategoryByLabel(categoriesWithChildren, targetLabel);
  if (!mainCategory) return null;

  const childCategories = categories
    .filter((category) => category.parent === mainCategory.id && (category.count ?? 0) > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const options: CategoryClarificationOption[] = childCategories
    .map((category) => {
      const cleanName = decodeHtmlEntities(category.name);
      const slugWords = category.slug.replace(/-/g, " ").trim();
      return {
        label: cleanName,
        queryToken: cleanName.toLowerCase(),
        keywords: [cleanName, slugWords].filter((value) => value.length > 0),
        slug: category.slug,
        count: category.count ?? 0
      };
    })
    .slice(0, 10);

  if (options.length < 2) {
    return null;
  }

  return {
    mainCategoryLabel: decodeHtmlEntities(mainCategory.name),
    mainCategorySlug: mainCategory.slug,
    options
  };
};

const mapCatalogToCard = (product: CatalogProduct): ProductCard => ({
  id: product.id,
  title: product.title,
  handle: product.handle,
  image: product.image,
  price: `${product.price.toFixed(2)}€`,
  compareAtPrice: product.compareAtPrice > product.price ? `${product.compareAtPrice.toFixed(2)}€` : undefined,
  reason: "",
  variantId: product.variantId,
  permalink: product.permalink,
  categoryNames: product.categories,
  simulatorAvailable: product.simulatorAvailable
});

export const fetchProductCatalog = async (): Promise<CatalogProduct[]> => {
  const cached = cache.get<CatalogProduct[]>(CATALOG_CACHE_KEY);
  if (cached) return cached;

  try {
    const all: CatalogProduct[] = [];
    let page = 1;
    while (all.length < MAX_CATALOG_PRODUCTS) {
      const products = await fetchWooProducts({
        page,
        perPage: 100,
        order: "desc",
        orderby: "date"
      });

      if (!products.length) break;

      for (const product of products) {
        const price = product.prices;
        const minorUnit = Number(price?.currency_minor_unit ?? 2);
        const current = Number(price?.price ?? 0) / 10 ** minorUnit;
        const regular = Number(price?.regular_price ?? 0) / 10 ** minorUnit;
        const categories = (product.categories ?? []).map((c) => c.name);

        all.push({
          id: String(product.id),
          title: product.name,
          handle: product.slug,
          categories,
          categorySlugs: (product.categories ?? []).map((c) => c.slug),
          categoryIds: (product.categories ?? []).map((c) => c.id),
          description: stripHtml(product.short_description || product.description || "").slice(0, 360),
          image: product.images?.[0]?.src ?? product.images?.[0]?.thumbnail ?? "",
          price: current,
          compareAtPrice: regular,
          variantId: String(product.id),
          permalink: product.permalink,
          simulatorAvailable: await hasSimulatorModelMatch(
            buildSimulatorLookupKey({ title: product.name, handle: product.slug, categories })
          )
        });

        if (all.length >= MAX_CATALOG_PRODUCTS) break;
      }

      page += 1;
    }

    cache.set(CATALOG_CACHE_KEY, all, CATALOG_TTL);
    return all;
  } catch (err) {
    console.error("[fetchProductCatalog] error:", err);
    return [];
  }
};

export const search_products = async (input: {
  query: string;
  tags?: string[];
  productTypes?: string[];
  budgetMax?: number;
  limit?: number;
}): Promise<ProductCard[]> => {
  const cacheKey = `woo:search:${JSON.stringify(input)}`;
  const cached = cache.get<ProductCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const limit = Math.max(1, Math.min(input.limit ?? 4, 30));
    const products = await fetchWooProducts({
      search: input.query,
      perPage: Math.min(Math.max(limit * 3, 8), 30),
      order: "desc",
      orderby: "date"
    });

    let cards = await Promise.all(products.map((product) => mapToCard(product)));

    if (input.budgetMax) {
      cards = cards.filter((card) => parseCardPrice(card.price) <= input.budgetMax!);
    }

    const trimmed = cards.slice(0, limit);
    cache.set(cacheKey, trimmed, 60_000);
    return trimmed;
  } catch (err) {
    console.error("[search_products] Woo API error:", err);
    return [];
  }
};

// Extract interior/furniture search hints from natural language.
const extractSearchKeywords = (text: string): string[] => {
  const normalized = normalizeForMatch(text);
  const keywords = new Set<string>();

  const include = (trigger: string[], mapped: string[]) => {
    if (trigger.some((needle) => normalized.includes(needle))) {
      mapped.forEach((value) => keywords.add(value));
    }
  };

  include(["ookapp", "oo kapp", "nightstand"], ["öökapp"]);
  include(["tvkapp", "tv kapp"], ["tv-kapp"]);
  include(["vitriinkapp"], ["vitriinkapp"]);
  include(["kummut"], ["kummut"]);
  include(["riiul", "raamaturiiul", "seinariiul"], ["riiul"]);
  include(["diivan", "nurgadiivan", "mooduldiivan"], ["diivan"]);
  include(["tugitool"], ["tugitool"]);
  include(["tool", "soogitool", "baaritool"], ["tool"]);
  include(["kontor", "kontoritool", "office chair", "chair"], ["kontoritool", "tool"]);
  include(["laud", "soogilaud", "diivanilaud", "abilaud", "kirjutuslaud", "konsoollaud", "aialaud"], ["laud"]);
  include(["voodi", "madrats"], ["voodi"]);
  include(["valgust", "lamp"], ["valgusti"]);
  include(["vaip"], ["vaip"]);
  include(["peegel"], ["peegel"]);
  include(["terrass", "aed", "ouemoobel", "aiamoobel"], ["aiamööbel"]);
  include(["nordic", "skandinaav"], ["nordic"]);

  // Generic "kapp" should stay generic — do not broaden it to shelves or vitrines.
  if (normalized.includes("kapp") && !normalized.includes("ookapp") && !normalized.includes("tvkapp")) {
    keywords.add("kapp");
  }

  return [...keywords];
};

const isCardRelevantToQuery = (
  card: ProductCard,
  semantics: QuerySemantics,
  queryTokens: string[]
): { relevant: boolean; score: number } => {
  const searchable = normalizeForMatch(
    `${card.title} ${card.handle} ${(card.categoryNames ?? []).join(" ")}`
  );
  const dimProfile = parseDimensionProfile(`${card.title} ${card.handle}`);
  const maxDim = dimProfile.maxDimension;

  if (semantics.requiredAliases.length > 0) {
    const hasRequiredAlias = semantics.requiredAliases.some((alias) => searchable.includes(alias));
    if (!hasRequiredAlias) {
      return { relevant: false, score: -100 };
    }
  }

  if (semantics.excludedAliases.length > 0) {
    const hasExcludedAlias = semantics.excludedAliases.some((alias) => searchable.includes(alias));
    if (hasExcludedAlias && !(semantics.requiredAliases.some((alias) => searchable.includes(alias)))) {
      return { relevant: false, score: -80 };
    }
  }

  if (
    semantics.requiredType === "diivan" &&
    (searchable.includes("tugitool") || searchable.includes("chair")) &&
    !normalizeForMatch(card.title).startsWith("diivan")
  ) {
    return { relevant: false, score: -75 };
  }

  let score = 0;

  for (const token of queryTokens) {
    if (searchable.includes(token)) {
      score += token.length >= 6 ? 4 : 3;
    }
  }

  if (semantics.requiredType) {
    score += 18;
  }

  if (semantics.hasDimensionRequest) {
    let comparableDims: number[] = [];
    if (semantics.dimensionAxis === "width") {
      comparableDims = dimProfile.widthCandidates.length ? dimProfile.widthCandidates : dimProfile.all;
    } else if (semantics.dimensionAxis === "length") {
      comparableDims = dimProfile.lengthCandidates.length ? dimProfile.lengthCandidates : dimProfile.all;
    } else {
      comparableDims = maxDim !== null ? [maxDim] : dimProfile.all;
    }

    if (!comparableDims.length) {
      return { relevant: false, score: -90 };
    }

    if (semantics.dimensionMaxCm !== undefined) {
      const fits = comparableDims.some((dim) => dim <= semantics.dimensionMaxCm! + 0.5);
      if (!fits) {
        return { relevant: false, score: -70 };
      }
      const closeness = Math.min(...comparableDims.map((dim) => Math.abs(semantics.dimensionMaxCm! - dim)));
      score += closeness <= 5 ? 8 : closeness <= 20 ? 6 : 4;
    }

    if (semantics.dimensionMinCm !== undefined) {
      const fits = comparableDims.some((dim) => dim >= semantics.dimensionMinCm! - 0.5);
      if (!fits) {
        return { relevant: false, score: -70 };
      }
      const bestOver = Math.max(...comparableDims) - semantics.dimensionMinCm!;
      score += bestOver <= 20 ? 5 : 3;
    }
  }

  if (semantics.smallPreferred) {
    const smallThreshold = semantics.requiredType === "ookapp" ? 70 : 120;
    if (maxDim !== null) {
      if (maxDim > smallThreshold) {
        return { relevant: false, score: -50 };
      }
      score += 6;
    }
  }

  if (score < 4) {
    return { relevant: false, score };
  }

  return { relevant: true, score };
};

const dedupeCardsByTitle = (cards: ProductCard[]): ProductCard[] => {
  const seen = new Set<string>();
  const deduped: ProductCard[] = [];

  for (const card of cards) {
    const key = normalizeForMatch(stripHtml(card.title));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(card);
  }

  return deduped;
};

const QUERY_TYPE_LABELS: Record<Exclude<QueryType, null>, string> = {
  ookapp: "öökapi",
  tvkapp: "TV-kapi",
  vitriinkapp: "vitriinkapi",
  riiul: "riiuli",
  kummut: "kummuti",
  laud: "laua",
  tool: "tooli",
  diivan: "diivani",
  voodi: "voodi",
  valgusti: "valgusti",
  vaip: "vaiba",
  peegel: "peegli"
};

const isLikelyDirectProductSearch = (input: {
  query: string;
  productTypes?: string[];
  tags?: string[];
}): boolean => {
  const normalized = normalizeForMatch(input.query);
  const tokenCount = extractQueryTokens(input.query).length;
  const semantics = detectQuerySemantics(input.query);

  return (
    tokenCount <= 4 &&
    (semantics.requiredType !== null || (input.productTypes?.length ?? 0) > 0) &&
    !semantics.hasDimensionRequest &&
    (input.tags?.length ?? 0) === 0 &&
    !/\bstiil|\bvarv|\bvärv|\bmaterjal|\btoon|\belutuba|\bmagamistuba|\bkontor|\bskandinaavia|\bnordic|\bmodern/.test(
      normalized
    )
  );
};

const buildQueryList = async (input: {
  query: string;
  productTypes?: string[];
  tags?: string[];
}): Promise<string[]> => {
  const fallbackQueries: string[] = [];
  const directSearch = isLikelyDirectProductSearch(input);

  fallbackQueries.push(input.query);

  if ((input.productTypes?.length ?? 0) > 0) {
    fallbackQueries.push(...(input.productTypes ?? []));
  }

  fallbackQueries.push(...extractSearchKeywords(input.query));

  const uniqueFallback = [...new Set(fallbackQueries.map((q) => q.trim()).filter(Boolean))];
  if (directSearch) {
    return uniqueFallback.slice(0, 3);
  }

  const planned = await generateProductSearchQueries({
    userMessage: input.query,
    fallbackQueries: uniqueFallback
  });

  return [...new Set([...uniqueFallback, ...planned].map((q) => q.trim()).filter(Boolean))].slice(0, 5);
};

const rankCardsForSearch = (
  cards: ProductCard[],
  constraints: { query: string; budgetMax?: number }
): Array<{ card: ProductCard; score: number }> => {
  const semantics = detectQuerySemantics(constraints.query);
  const queryTokens = extractQueryTokens(constraints.query);

  const ranked = cards
    .map((card) => {
      const relevance = isCardRelevantToQuery(card, semantics, queryTokens);
      const searchable = normalizeForMatch(
        `${card.title} ${card.handle} ${(card.categoryNames ?? []).join(" ")}`
      );
      const exactQueryBoost = searchable.includes(normalizeForMatch(constraints.query)) ? 12 : 0;
      const budgetBoost =
        constraints.budgetMax && parseCardPrice(card.price) <= constraints.budgetMax ? 3 : 0;

      return {
        card,
        score: relevance.score + exactQueryBoost + budgetBoost,
        relevant: relevance.relevant
      };
    })
    .filter((entry) => entry.relevant)
    .sort((left, right) => right.score - left.score);

  if (ranked.length > 0) {
    return ranked.map(({ card, score }) => ({ card, score }));
  }

  return cards
    .map((card) => ({
      card,
      score: normalizeForMatch(`${card.title} ${(card.categoryNames ?? []).join(" ")}`).includes(
        normalizeForMatch(constraints.query)
      )
        ? 10
        : 0
    }))
    .sort((left, right) => right.score - left.score);
};

const buildReasonFromSearch = (
  card: ProductCard,
  constraints: { query: string; budgetMax?: number }
): string => {
  const semantics = detectQuerySemantics(constraints.query);
  const parts: string[] = [];
  const dims = parseDimensionProfile(`${card.title} ${card.handle}`);

  if (semantics.requiredType) {
    parts.push(`See sobib sinu otsitud ${QUERY_TYPE_LABELS[semantics.requiredType]} tüübi alla`);
  } else {
    parts.push("See kattub hästi sinu otsinguga");
  }

  if (semantics.dimensionMaxCm !== undefined && dims.maxDimension !== null && dims.maxDimension <= semantics.dimensionMaxCm + 0.5) {
    parts.push(`ja mahub umbes ${Math.round(semantics.dimensionMaxCm)} cm piirangusse`);
  } else if (
    constraints.budgetMax &&
    parseCardPrice(card.price) > 0 &&
    parseCardPrice(card.price) <= constraints.budgetMax
  ) {
    parts.push("ja mahub sinu eelarvesse");
  }

  return `${parts.join(" ")}.`;
};

const attachAlternativesToCards = (cards: ProductCard[], alternativePool: ProductCard[]): ProductCard[] =>
  cards.map((card) => ({
    ...card,
    alternatives: alternativePool
      .filter((alternative) => alternative.id !== card.id)
      .slice(0, 4)
      .map((alternative) => ({ ...alternative, alternatives: undefined }))
  }));

export const recommend_products = async (input: {
  intent: string;
  constraints: { query: string; budgetMax?: number; vegan?: boolean; goal?: string; productTypes?: string[]; tags?: string[] };
  limit: number;
}): Promise<ProductCard[]> => {
  const queries = await buildQueryList({
    query: input.constraints.query,
    productTypes: input.constraints.productTypes,
    tags: input.constraints.tags
  });

  const searchResults = await Promise.all(
    queries.map((query) =>
      search_products({
        query,
        tags: input.constraints.tags,
        productTypes: input.constraints.productTypes,
        budgetMax: input.constraints.budgetMax,
        limit: 18
      })
    )
  );

  const searchCards = dedupeCardsByTitle(searchResults.flat()).slice(0, 90);
  const rankedSearchCards = rankCardsForSearch(searchCards, input.constraints);

  let candidatePool = rankedSearchCards.map((entry) => entry.card);

  if (candidatePool.length < Math.max(input.limit + 2, 6)) {
    const catalog = await fetchProductCatalog();
    const catalogCards = catalog
      .map((product) => mapCatalogToCard(product))
      .filter((card) => !input.constraints.budgetMax || parseCardPrice(card.price) <= input.constraints.budgetMax)
      .slice(0, 500);

    const merged = dedupeCardsByTitle([...candidatePool, ...catalogCards]);
    candidatePool = rankCardsForSearch(merged, input.constraints)
      .map((entry) => entry.card)
      .slice(0, 60);
  }

  if (candidatePool.length === 0) {
    return [];
  }

  const primaryCards = candidatePool
    .slice(0, input.limit)
    .map((card) => ({
      ...card,
      reason: buildReasonFromSearch(card, input.constraints)
    }));

  const alternativePool = candidatePool
    .slice(input.limit, input.limit + 8)
    .map((card) => ({
      ...card,
      reason: buildReasonFromSearch(card, input.constraints),
      alternatives: undefined
    }));

  return attachAlternativesToCards(primaryCards, alternativePool);
};

export const create_cart = async () => {
  return { cartId: "", checkoutUrl: commerceConfig.links.cart };
};

export const get_cart = async (_input: { cartId: string }): Promise<any> => {
  return null;
};

export const add_to_cart = async (input: { cartId: string; variantId: string; quantity: number }) => {
  const productId = Number(input.variantId);
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new Error("Invalid product id");
  }

  const product = await fetchWooProductById(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  return {
    id: `local-${Date.now()}`,
    checkoutUrl: `${commerceConfig.storeBaseUrl}/?add-to-cart=${product.id}`,
    cost: { subtotalAmount: { amount: "0", currencyCode: "EUR" } },
    lines: {
      edges: [
        {
          node: {
            id: String(product.id),
            quantity: input.quantity,
            merchandise: {
              id: String(product.id),
              title: product.name,
              product: { title: product.name }
            }
          }
        }
      ]
    }
  };
};

export const answer_faq = async (input: { question: string }) => {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const text = normalize(input.question);
  const tokens = new Set(text.split(" ").filter((t) => t.length > 2));

  let best: { score: number; answer: string } | null = null;
  for (const entry of faqEntries) {
    let score = 0;
    for (const kwRaw of entry.keywords) {
      const kw = normalize(kwRaw);
      if (!kw) continue;
      if (text.includes(kw)) score += kw.length >= 8 ? 4 : 3;
      const kwTokens = kw.split(" ").filter((t) => t.length > 2);
      for (const part of kwTokens) {
        if (tokens.has(part)) score += 1;
      }
    }

    if (!best || score > best.score) {
      best = { score, answer: entry.answer };
    }
  }

  const linkForQuestion = (() => {
    if (/tarne|shipping|kohaletoimet|kuller|pakiautomaat|laos|jareltellit/.test(text)) return commerceConfig.links.shipping;
    if (/tagastus|refund|return|taganemis|raha tagasi|defekt/.test(text)) return commerceConfig.links.returns;
    if (/garantii|warranty|pretensioon|reklamatsioon/.test(text)) return commerceConfig.links.warranty;
    if (/makse|maksmine|kaart|pangalink|ulekanne|montonio/.test(text)) return commerceConfig.links.paymentMethods;
    if (/privaatsus|isikuandmed|gdpr|andmekaitse/.test(text)) return commerceConfig.links.privacy;
    if (/kontakt|telefon|email|e post|klienditugi|support/.test(text)) return commerceConfig.links.contact;
    if (/tingimus|muugitingimus|tehing|leping/.test(text)) return commerceConfig.links.salesTerms;
    return commerceConfig.links.contact;
  })();

  if (best && best.score >= 3) {
    return { answer: best.answer, links: commerceConfig.links, recommendedLink: linkForQuestion };
  }

  return {
    answer: `Kahjuks ei leidnud sellele kohe täpset vastust. Võta ühendust: ${commerceConfig.supportEmail} või ${commerceConfig.supportPhone}. Vaata ka: ${linkForQuestion}`,
    links: commerceConfig.links,
    recommendedLink: linkForQuestion
  };
};

export const computeCommerceActions = (subtotal: number) => {
  const threshold = commerceConfig.freeShippingThreshold;
  const freeShippingGap = threshold > 0 ? Math.max(0, threshold - subtotal) : undefined;

  let applyDiscountHint: string | undefined;
  for (const tier of commerceConfig.discountThresholds) {
    if (subtotal < tier.subtotal) {
      const gap = (tier.subtotal - subtotal).toFixed(2);
      applyDiscountHint = `Lisa ${gap}€ eest ja saa ${tier.discountPct}% allahindlust.`;
      break;
    }
  }

  return { freeShippingGap, applyDiscountHint };
};

export const handoff = async (_input: { summary: string }) => {
  return {
    nextStep: `Palun kirjuta ${commerceConfig.supportEmail} või helista ${commerceConfig.supportPhone}.`
  };
};

export const resolveProductCard = async (handleOrId: string): Promise<ProductCard | null> => {
  const raw = (handleOrId || "").trim();
  if (!raw) return null;

  const numericId = Number(raw);
  let product: WooProduct | null = null;

  if (Number.isFinite(numericId) && numericId > 0) {
    product = await fetchWooProductById(numericId);
  } else {
    product = await fetchWooProductBySlug(raw);
  }

  if (!product) return null;
  return mapToCard(product);
};
