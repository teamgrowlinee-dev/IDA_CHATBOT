export interface ProductCard {
  id: string;
  title: string;
  handle: string;
  image: string;
  price: string;
  compareAtPrice?: string;
  reason: string;
  variantId: string;
  permalink?: string;
  categoryNames?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: ProductCard[];
  productSummary?: string;
}

export interface CommerceActions {
  freeShippingGap?: number;
  applyDiscountHint?: string;
}

export interface ChatResponse {
  message: string;
  cards: ProductCard[];
  suggestions: string[];
  actions: CommerceActions;
  cartId?: string;
  productSummary?: string;
}

export interface BundleAnswers {
  room: string;
  anchorProduct: string;
  budgetRange: string;
  budgetCustom?: number;
  style: string;
  colorTone: string;
  hasChildren: boolean;
  hasPets: boolean;
  materialPreference: string;
  dimensionsKnown: boolean;
  widthCm?: number;
  lengthCm?: number;
}

export interface BundleItem extends ProductCard {
  roleInBundle: "ankur" | "lisatoode" | "aksessuaar";
  whyChosen: string;
}

export interface Bundle {
  title: string;
  styleSummary: string;
  totalPrice: number;
  items: BundleItem[];
  keyReasons: string[];
  tradeoffs: string[];
}

export interface BundleResponse {
  bundles: Bundle[];
  message: string;
}
