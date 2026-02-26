import { Router } from "express";
import { recommend_products, resolveProductCard, search_products } from "../services/storefront-tools.js";

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

export default router;
