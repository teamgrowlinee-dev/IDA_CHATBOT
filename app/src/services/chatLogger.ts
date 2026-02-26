import { env } from "../config/env.js";

export function logChatMessage(params: {
  sessionId: string;
  cartId?: string;
  userMessage: string;
  assistantMessage: string;
}): void {
  const webhookUrl = env.CHATLOG_WEBHOOK_URL;
  if (!webhookUrl) return;

  const now = new Date();

  const payload: Record<string, string> = {
    timestamp: now.toISOString(),
    sessionId: params.sessionId,
    clientId: params.sessionId,
    cartId: params.cartId ?? "",
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    storeOrigin: env.STORE_BASE_URL,
    status: "ok"
  };

  if (env.CHATLOG_WEBHOOK_SECRET) {
    payload.secret = env.CHATLOG_WEBHOOK_SECRET;
  }

  // fire-and-forget – ei blokeeri vastust
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch((err: Error) => {
    console.error("[chatlog] webhook error:", err.message);
  });
}
