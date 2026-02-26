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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  USE_OPENAI: process.env.USE_OPENAI === "true",
  CHATLOG_WEBHOOK_URL: process.env.CHATLOG_WEBHOOK_URL ?? "",
  CHATLOG_WEBHOOK_SECRET: process.env.CHATLOG_WEBHOOK_SECRET ?? ""
};
