import { Router } from "express";
import { fetchAllWooProductCategories, fetchWooProductBySlug, fetchWooProductById } from "../lib/woocommerce.js";
import {
  fetchProductCatalog,
  recommend_products,
  resolveProductCard,
  search_products
} from "../services/storefront-tools.js";

const router = Router();

router.get("/storefront/search", async (req, res) => {
  try {
    const query = String(req.query.q ?? "");
    const limit = Number(req.query.limit ?? 4);
    const cards = await search_products({ query, limit });
    res.json({ cards });
  } catch (error) {
    console.error("[storefront/search] error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

router.post("/storefront/recommend", async (req, res) => {
  try {
    const { query, constraints, limit } = req.body;
    const cards = await recommend_products({
      intent: "product_reco",
      constraints: { query: query ?? "", ...constraints },
      limit: limit ?? 4
    });
    res.json({ cards });
  } catch (error) {
    console.error("[storefront/recommend] error:", error);
    res.status(500).json({ error: "Recommendation failed" });
  }
});

router.get("/storefront/product/:handleOrId", async (req, res) => {
  try {
    const raw = String(req.params.handleOrId ?? "");
    const product = await resolveProductCard(raw);
    res.json({ product });
  } catch (error) {
    console.error("[storefront/product] error:", error);
    res.status(500).json({ error: "Product lookup failed" });
  }
});

router.get("/storefront/product/:handleOrId/images", async (req, res) => {
  try {
    const raw = String(req.params.handleOrId ?? "").trim();
    const isNumeric = /^\d+$/.test(raw);
    const product = isNumeric
      ? await fetchWooProductById(Number(raw))
      : await fetchWooProductBySlug(raw);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const images = (product.images ?? []).map((img: any) => ({
      id: img.id,
      src: img.src,
      alt: img.alt ?? "",
      name: img.name ?? ""
    }));
    res.json({ id: String(product.id), title: product.name, handle: product.slug, images });
  } catch (error) {
    console.error("[storefront/product/images] error:", error);
    res.status(500).json({ error: "Image lookup failed" });
  }
});

router.get("/storefront/categories", async (_req, res) => {
  try {
    const categories = await fetchAllWooProductCategories({ hideEmpty: true, maxPages: 25 });
    const mapped = categories
      .filter((category) => (category.count ?? 0) > 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parent,
        count: category.count ?? 0
      }));

    res.json({ categories: mapped });
  } catch (error) {
    console.error("[storefront/categories] error:", error);
    res.status(500).json({ error: "Categories lookup failed" });
  }
});

router.get("/storefront/catalog", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const category = String(req.query.category ?? "").trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(48, Math.max(1, Number(req.query.perPage ?? 18)));
    const minPrice = Number.isFinite(Number(req.query.minPrice)) ? Number(req.query.minPrice) : undefined;
    const maxPrice = Number.isFinite(Number(req.query.maxPrice)) ? Number(req.query.maxPrice) : undefined;
    const sort = String(req.query.sort ?? "relevance");

    const catalog = await fetchProductCatalog();
    let filtered = catalog.filter((item) => {
      const matchesQuery =
        !q ||
        `${item.title} ${item.handle} ${item.description} ${item.categories.join(" ")}`.toLowerCase().includes(q);
      const matchesCategory = !category || item.categorySlugs.some((slug) => slug.toLowerCase() === category);
      const matchesMin = minPrice === undefined || item.price >= minPrice;
      const matchesMax = maxPrice === undefined || item.price <= maxPrice;
      return matchesQuery && matchesCategory && matchesMin && matchesMax;
    });

    if (sort === "price-asc") filtered = filtered.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") filtered = filtered.sort((a, b) => b.price - a.price);
    else if (sort === "name-asc") filtered = filtered.sort((a, b) => a.title.localeCompare(b.title, "et"));

    const total = filtered.length;
    const offset = (page - 1) * perPage;
    const pageItems = filtered.slice(offset, offset + perPage);

    const items = pageItems.map((item) => ({
      id: item.id,
      title: item.title,
      handle: item.handle,
      image: item.image,
      price: `${item.price.toFixed(2)}€`,
      compareAtPrice: item.compareAtPrice > item.price ? `${item.compareAtPrice.toFixed(2)}€` : undefined,
      reason: "",
      variantId: item.variantId,
      permalink: item.permalink,
      categoryNames: item.categories,
      categorySlugs: item.categorySlugs
    }));

    const facetMap = new Map<string, number>();
    for (const item of filtered) {
      for (const slug of item.categorySlugs) {
        facetMap.set(slug, (facetMap.get(slug) ?? 0) + 1);
      }
    }

    const facets = {
      categories: [...facetMap.entries()].map(([slug, count]) => ({ slug, count }))
    };

    res.json({
      items,
      pagination: {
        page,
        perPage,
        total
      },
      facets
    });
  } catch (error) {
    console.error("[storefront/catalog] error:", error);
    res.status(500).json({ error: "Catalog lookup failed" });
  }
});

export default router;
