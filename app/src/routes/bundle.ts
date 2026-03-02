import { Router } from "express";
import type { BundleAnswers, BundleResponse } from "../types/chat.js";
import { generateBundles } from "../services/bundle.js";

const router = Router();

router.post("/bundle", async (req, res) => {
  try {
    const answers = req.body as BundleAnswers;

    if (!answers.room || !answers.budgetRange || !answers.style) {
      res.status(400).json({ error: "Puuduvad kohustuslikud väljad: room, budgetRange, style" });
      return;
    }

    const bundles = await generateBundles(answers);
    const response: BundleResponse = {
      bundles,
      message: "Siin on sinu personaalsed komplektid:"
    };
    res.json(response);
  } catch (err) {
    console.error("[bundle route] Error:", err);
    res.status(500).json({ error: "Komplektide genereerimine ebaõnnestus" });
  }
});

export default router;
