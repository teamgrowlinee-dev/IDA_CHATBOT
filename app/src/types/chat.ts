export type ChatIntent =
  | "greeting"
  | "shipping"
  | "returns"
  | "faq"
  | "order_help"
  | "product_reco"
  | "smalltalk";

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
