import { Router } from "express";
import type { BundleAnswers, BundleResponse } from "../types/chat.js";
import { generateBundles, getBundleStyleOptions } from "../services/bundle.js";
import { isBudgetCustomInRange, parseBudgetRangeLimits } from "../services/bundle-recipe.js";

const router = Router();

router.post("/bundle/options", async (req, res) => {
  try {
    const payload = req.body as { room?: string; selectedElements?: string[]; anchorProduct?: string };
    const room = String(payload.room ?? "").trim();
    if (!room) {
      res.status(400).json({ error: "Puudub kohustuslik väli: room" });
      return;
    }

    const styleOptionsByElement = await getBundleStyleOptions({
      room,
      selectedElements: Array.isArray(payload.selectedElements) ? payload.selectedElements : [],
      anchorProduct: typeof payload.anchorProduct === "string" ? payload.anchorProduct : ""
    });

    res.json({ styleOptionsByElement });
  } catch (err) {
    console.error("[bundle/options route] Error:", err);
    res.status(500).json({ error: "Valikute laadimine ebaõnnestus" });
  }
});

router.post("/bundle", async (req, res) => {
  try {
    const answers = req.body as BundleAnswers;

    if (!answers.room || !answers.budgetRange) {
      res.status(400).json({ error: "Puuduvad kohustuslikud väljad: room, budgetRange" });
      return;
    }

    const normalizedAnswers: BundleAnswers = {
      ...answers,
      selectedElements: Array.isArray(answers.selectedElements) ? answers.selectedElements : [],
      elementPreferences: Array.isArray(answers.elementPreferences) ? answers.elementPreferences : [],
      anchorProduct: typeof answers.anchorProduct === "string" ? answers.anchorProduct : ""
    };

    const budgetLimits = parseBudgetRangeLimits(normalizedAnswers.budgetRange);
    if (!budgetLimits) {
      res.status(400).json({ error: "Sobimatu eelarvevahemik. Vali toetatud vahemik." });
      return;
    }

    if (normalizedAnswers.budgetCustom !== undefined && normalizedAnswers.budgetCustom !== null) {
      const customBudget = Number(normalizedAnswers.budgetCustom);
      if (!Number.isFinite(customBudget)) {
        res.status(400).json({ error: "Täpne summa peab olema number." });
        return;
      }
      if (!isBudgetCustomInRange(normalizedAnswers.budgetRange, customBudget)) {
        const maxLabel = budgetLimits.max >= 25000 ? "25000+" : String(budgetLimits.max);
        res.status(400).json({
          error: `Täpne summa peab jääma valitud vahemikku ${budgetLimits.min}–${maxLabel}€`
        });
        return;
      }
      normalizedAnswers.budgetCustom = Math.round(customBudget);
    }

    const bundles = await generateBundles(normalizedAnswers);
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
