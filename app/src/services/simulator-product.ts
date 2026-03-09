import { fetchProductCatalog } from "./storefront-tools.js";
import type { ProductDimensionsCm, SimulatorProductMeta } from "../types/simulator.js";

interface CatalogProductLike {
  id: string;
  title: string;
  handle: string;
  categories: string[];
  categorySlugs: string[];
  description: string;
}

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const DEFAULT_MODEL_GLB = "https://threejs.org/examples/models/gltf/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

const CATEGORY_DEFAULT_DIMS: Record<string, ProductDimensionsCm> = {
  sofa: { w: 220, d: 95, h: 85 },
  armchair: { w: 85, d: 90, h: 90 },
  bed: { w: 180, d: 210, h: 95 },
  sunlounger: { w: 75, d: 200, h: 80 },
  desk: { w: 140, d: 70, h: 75 },
  table: { w: 160, d: 90, h: 75 },
  coffeetable: { w: 120, d: 70, h: 45 },
  chair: { w: 55, d: 55, h: 90 },
  ottoman: { w: 80, d: 80, h: 45 },
  bench: { w: 120, d: 40, h: 45 },
  shelf: { w: 90, d: 35, h: 190 },
  cabinet: { w: 100, d: 45, h: 120 },
  dresser: { w: 100, d: 50, h: 90 },
  tvunit: { w: 160, d: 45, h: 55 },
  wardrobe: { w: 120, d: 60, h: 210 },
  lamp: { w: 40, d: 40, h: 150 },
  rug: { w: 200, d: 300, h: 2 },
  mirror: { w: 60, d: 5, h: 150 },
  nightstand: { w: 50, d: 40, h: 60 },
  decor: { w: 40, d: 40, h: 40 },
  barstool: { w: 45, d: 45, h: 110 },
  coatrack: { w: 40, d: 40, h: 180 },
  sidetable: { w: 50, d: 50, h: 55 },
  consoletable: { w: 120, d: 35, h: 80 },
  pendantlamp: { w: 40, d: 40, h: 200 },
  tablelamp: { w: 35, d: 35, h: 55 },
  laddershelf: { w: 80, d: 35, h: 170 },
  wallshelf: { w: 100, d: 25, h: 120 },
  vitrinecabinet: { w: 90, d: 45, h: 180 },
  cornersofa: { w: 270, d: 170, h: 85 },
  sofabed: { w: 210, d: 100, h: 90 },
  chaiselongue: { w: 90, d: 200, h: 85 },
  taburet: { w: 40, d: 40, h: 50 },
  sideboard: { w: 160, d: 50, h: 80 },
  shoerack: { w: 80, d: 35, h: 90 },
  vanity: { w: 90, d: 50, h: 145 },
  roundtable: { w: 90, d: 90, h: 75 },
  officechair: { w: 60, d: 60, h: 115 },
  arclamp: { w: 50, d: 50, h: 190 },
  barcart: { w: 55, d: 45, h: 90 },
  winerack: { w: 60, d: 30, h: 60 },
  hangingchair: { w: 110, d: 100, h: 190 },
  generic: { w: 100, d: 60, h: 90 }
};

const inferCategory = (product: CatalogProductLike): string => {
  const s = normalizeForMatch(
    [product.title, ...product.categories, ...product.categorySlugs, product.description].join(" ")
  );
  const rawTitle = product.title.toLowerCase();

  // Most specific first
  if (/paevitusvoodi|paevitus voodi|lezlong|sunlounger/.test(s)) return "sunlounger";
  if (/voodi|voodipeats/.test(s)) return "bed";
  if (/diivanilaud|kohvilaud|sohvalaud/.test(s)) return "coffeetable";
  if (/konsoollaud|konsool/.test(s)) return "consoletable";
  if (/abilaud|korvallaud|abielaud|sidetable/.test(s)) return "sidetable";
  if (/nurgadiivan|nurga diivan|nurk diivan|l diivan/.test(s)) return "cornersofa";
  if (/diivanvoodi|diivan voodi/.test(s)) return "sofabed";
  if (/lamamistool|lamamis/.test(s)) return "chaiselongue";
  if (/diivan|sohva/.test(s)) return "sofa";
  if (/tugitool/.test(s)) return "armchair";
  if (/baaritool|baartool|poolkorge tool/.test(s)) return "barstool";
  if (/kirjutuslaud|toolaud|arvutilaud|desk/.test(s)) return "desk";
  if ((rawTitle.includes("ø") || /ummargune/.test(s)) && /laud/.test(s)) return "roundtable";
  if (/soogilaud|laud/.test(s)) return "table";
  if (/nagi|nagiriiuli|riidekonks|riidepuu/.test(s)) return "coatrack";
  if (/taburet/.test(s)) return "taburet";
  if (/ripptool|ripptugi|kiiktool/.test(s)) return "hangingchair";
  if (/kontoritool/.test(s)) return "officechair";
  if (/tool|chair/.test(s)) return "chair";
  if (/kummut/.test(s)) return "dresser";
  if (/serveerimislaud|puhvet/.test(s)) return "sideboard";
  if (/riietumislaud/.test(s)) return "vanity";
  if (/baarikaru|serveerimiskaru/.test(s)) return "barcart";
  if (/tv kapp|tvkapp|telerialus|tv alus/.test(s)) return "tvunit";
  if (/garderoob|riidekapp/.test(s)) return "wardrobe";
  if (/jalatsiriiul|kingseriiul/.test(s)) return "shoerack";
  if (/redelriiul/.test(s)) return "laddershelf";
  if (/seinariiul/.test(s)) return "wallshelf";
  if (/vitriinkapp|vitriin/.test(s)) return "vitrinecabinet";
  if (/riiul|raamaturiiul/.test(s)) return "shelf";
  if (/veiniriiul|veinirest|veinihoidja/.test(s)) return "winerack";
  if (/kapp/.test(s)) return "cabinet";
  if (/tumba|puf|istepadi/.test(s)) return "ottoman";
  if (/pingike|bench/.test(s)) return "bench";
  if (/kaarlamp|kaar lamp|kaarelamp/.test(s)) return "arclamp";
  if (/rippvalgusti|laevalgusti|luhter|luuster/.test(s)) return "pendantlamp";
  if (/lauavalgusti|laualamp|laualamb/.test(s)) return "tablelamp";
  if (/lamp|valgusti/.test(s)) return "lamp";
  if (/vaip|matt/.test(s)) return "rug";
  if (/peegel/.test(s)) return "mirror";
  if (/ookapiike|voodi kapp/.test(s)) return "nightstand";
  if (/dekor|aksessuaar/.test(s)) return "decor";
  return "generic";
};

const clampDimension = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parseDimensions = (product: CatalogProductLike, category: string): ProductDimensionsCm => {
  const searchable = `${product.title} ${product.description}`;
  const sizeMatch = searchable.match(/(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{2,3}))?/i);
  const fallback = CATEGORY_DEFAULT_DIMS[category] ?? CATEGORY_DEFAULT_DIMS.generic;

  if (!sizeMatch) return fallback;

  const first = Number(sizeMatch[1]);
  const second = Number(sizeMatch[2]);
  const third = Number(sizeMatch[3] ?? NaN);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return fallback;
  }

  if (Number.isFinite(third)) {
    return {
      w: clampDimension(first, 25, 500),
      d: clampDimension(second, 20, 400),
      h: clampDimension(third, 10, 320)
    };
  }

  return {
    w: clampDimension(first, 25, 500),
    d: clampDimension(second, 20, 400),
    h: fallback.h
  };
};

const findCatalogProduct = (products: CatalogProductLike[], sku: string): CatalogProductLike | null => {
  const raw = (sku ?? "").trim();
  const normalized = normalizeForMatch(raw);
  if (!raw || !normalized) return null;

  return (
    products.find((product) => product.id === raw) ??
    products.find((product) => product.handle === raw) ??
    products.find((product) => normalizeForMatch(product.handle) === normalized) ??
    products.find((product) => normalizeForMatch(product.title) === normalized) ??
    products.find((product) => normalizeForMatch(product.title).includes(normalized)) ??
    null
  );
};

export const resolveSimulatorProductMeta = async (sku: string): Promise<SimulatorProductMeta | null> => {
  const catalog = (await fetchProductCatalog()) as unknown as CatalogProductLike[];
  const product = findCatalogProduct(catalog, sku);
  if (!product) return null;

  const category = inferCategory(product);
  const dimensions = parseDimensions(product, category);

  return {
    sku: sku.trim(),
    name: product.title,
    category,
    dimensions_cm: dimensions,
    model_glb_url: DEFAULT_MODEL_GLB
  };
};
