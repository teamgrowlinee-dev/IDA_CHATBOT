import { env } from "../config/env.js";

export function logChatMessage(params: {
  sessionId: string;
  cartId?: string;
  userMessage: string;
  assistantMessage: string;
}): void {
  const webhookUrl = env.N8N_CHATLOG_WEBHOOK_URL;
  if (!webhookUrl) return;

  const now = new Date();

  const payload = {
    session_id: params.sessionId,
    client_id: params.sessionId,
    cart_id: params.cartId ?? "",
    user_message: params.userMessage,
    assistant_message: params.assistantMessage,
    timestamp: now.toISOString(),
    store_origin: env.STORE_BASE_URL
  };

  // fire-and-forget – ei blokeeri vastust
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch((err: Error) => {
    console.error("[chatlog] webhook error:", err.message);
  });
}
