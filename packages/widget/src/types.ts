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
