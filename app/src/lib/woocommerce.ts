import { env } from "../config/env.js";

const buildUrl = (pathname: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(pathname, env.STORE_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
};

export interface WooImage {
  src?: string;
  thumbnail?: string;
}

export interface WooPrice {
  price?: string;
  regular_price?: string;
  currency_symbol?: string;
  currency_minor_unit?: number;
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description?: string;
  short_description?: string;
  images?: WooImage[];
  categories?: WooCategory[];
  prices?: WooPrice;
}

export interface WooProductCategoryNode {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count?: number;
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
};

export const fetchWooProducts = async (params?: {
  search?: string;
  page?: number;
  perPage?: number;
  order?: "asc" | "desc";
  orderby?: "date" | "title" | "price" | "popularity" | "rating";
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  onSale?: boolean;
  include?: number[];
  slug?: string;
}) => {
  const query: Record<string, string | number | undefined> = {
    per_page: params?.perPage ?? 12,
    page: params?.page ?? 1,
    search: params?.search,
    order: params?.order,
    orderby: params?.orderby,
    min_price: params?.minPrice,
    max_price: params?.maxPrice,
    featured: params?.featured ? "true" : undefined,
    on_sale: params?.onSale ? "true" : undefined,
    include: params?.include?.length ? params.include.join(",") : undefined,
    slug: params?.slug
  };

  return fetchJson<WooProduct[]>(buildUrl("/wp-json/wc/store/v1/products", query));
};

export const fetchWooProductBySlug = async (slug: string): Promise<WooProduct | null> => {
  const products = await fetchWooProducts({ slug, perPage: 1, page: 1 });
  return products[0] ?? null;
};

export const fetchWooProductById = async (id: number): Promise<WooProduct | null> => {
  const products = await fetchWooProducts({ include: [id], perPage: 1, page: 1 });
  return products[0] ?? null;
};

export const fetchWooProductCategories = async (params?: {
  page?: number;
  perPage?: number;
  hideEmpty?: boolean;
  parent?: number;
  search?: string;
}) => {
  const query: Record<string, string | number | undefined> = {
    page: params?.page ?? 1,
    per_page: params?.perPage ?? 100,
    hide_empty: params?.hideEmpty ? "true" : undefined,
    parent: params?.parent,
    search: params?.search
  };

  return fetchJson<WooProductCategoryNode[]>(buildUrl("/wp-json/wc/store/v1/products/categories", query));
};

export const fetchAllWooProductCategories = async (params?: {
  hideEmpty?: boolean;
  maxPages?: number;
}): Promise<WooProductCategoryNode[]> => {
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(params?.maxPages ?? 20, 50));
  const all: WooProductCategoryNode[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchWooProductCategories({
      page,
      perPage,
      hideEmpty: params?.hideEmpty
    });

    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < perPage) break;
  }

  return all;
};
