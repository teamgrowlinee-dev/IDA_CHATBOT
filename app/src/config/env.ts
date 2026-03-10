import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPort = process.env.PORT;

const envCandidates = [path.resolve(__dirname, "../../../.env"), path.resolve(__dirname, "../../.env")];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

if (cliPort) {
  process.env.PORT = cliPort;
}

const normalizeBaseUrl = (value: string | undefined, fallback: string) => {
  const input = (value ?? fallback).trim();
  try {
    const url = new URL(input);
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
};

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 8787),
  STORE_BASE_URL: normalizeBaseUrl(process.env.STORE_BASE_URL, "https://idastuudio.ee"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_FAST_MODEL: process.env.ANTHROPIC_FAST_MODEL ?? "claude-3-5-haiku-20241022",
  ANTHROPIC_QUALITY_MODEL: process.env.ANTHROPIC_QUALITY_MODEL ?? "claude-sonnet-4-20250514",
  // Legacy OpenAI support (fallback if no Anthropic key)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  USE_OPENAI: process.env.USE_OPENAI === "true",
  get USE_AI() { return Boolean(this.ANTHROPIC_API_KEY) || (this.USE_OPENAI && Boolean(this.OPENAI_API_KEY)); },
  PLANNER_V3_ENABLED: process.env.PLANNER_V3_ENABLED !== "false",
  PLANNER_SCAN_ENABLED: process.env.PLANNER_SCAN_ENABLED === "true",
  PLANNER_MANUAL_ENABLED: process.env.PLANNER_MANUAL_ENABLED !== "false",
  PLANNER_ENTRY_MODE: process.env.PLANNER_ENTRY_MODE === "public-nav" ? "public-nav" : "chatbot-only",
  CHATLOG_WEBHOOK_URL: process.env.CHATLOG_WEBHOOK_URL ?? "",
  CHATLOG_WEBHOOK_SECRET: process.env.CHATLOG_WEBHOOK_SECRET ?? ""
};
