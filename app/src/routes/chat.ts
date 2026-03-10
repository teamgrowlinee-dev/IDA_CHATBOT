import { Router } from "express";
import { env } from "../config/env.js";
import { addCartLineFromChat, runChat } from "../services/chat.js";
import { logChatMessage } from "../services/chatLogger.js";

const router = Router();

router.get("/chat/health", (_req, res) => {
  res.json({
    ok: true,
    provider: env.ANTHROPIC_API_KEY ? "anthropic" : env.USE_OPENAI && env.OPENAI_API_KEY ? "openai" : "none",
    useAI: env.USE_AI,
    hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
    anthropicFastModel: env.ANTHROPIC_FAST_MODEL,
    anthropicQualityModel: env.ANTHROPIC_QUALITY_MODEL,
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    openAIModel: env.OPENAI_MODEL
  });
});

router.post("/chat", async (req, res) => {
  try {
    const { message, cartId, history } = req.body as {
      message?: string;
      cartId?: string;
      history?: Array<{ role: "user" | "assistant"; text: string }>;
    };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const result = await runChat({ message, cartId, history });
    res.json(result);

    logChatMessage({
      sessionId: result.cartId ?? cartId ?? "anon",
      cartId: result.cartId,
      userMessage: message,
      assistantMessage: result.message
    });
  } catch (error) {
    console.error("[chat] error:", error);
    res.status(200).json({
      message:
        "Vabandust, ma ei saanud hetkel poe andmetega ühendust. Proovi palun hetke pärast uuesti või kirjuta meile info@idastuudio.ee.",
      cards: [],
      suggestions: ["Tarne info", "Tagastamine", "Kontakt"],
      actions: {}
    });
  }
});

router.post("/chat/add-to-cart", async (req, res) => {
  try {
    const { cartId, variantId, quantity } = req.body as {
      cartId?: string;
      variantId?: string;
      quantity?: number;
    };

    if (!variantId) {
      res.status(400).json({ error: "variantId is required" });
      return;
    }

    const result = await addCartLineFromChat({ cartId, variantId, quantity });
    res.json(result);
  } catch (error) {
    console.error("[chat/add-to-cart] error:", error);
    res.status(200).json({
      ok: false,
      userMessage:
        "Vabandust, praegu ei saanud toodet ostukorvi lisada. Proovi uuesti või lisa toode otse tootelehel."
    });
  }
});

export default router;
