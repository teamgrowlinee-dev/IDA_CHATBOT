import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, "../../public/simulator/models");
const MODELS_BASE_URL = "/simulator/models";

const MODEL_TOKEN_STOP_WORDS = new Set([
  "diivan",
  "laud",
  "abilaud",
  "soogilaud",
  "sofa",
  "table",
  "tool",
  "tugitool",
  "chair",
  "moodul",
  "mooduldiivan",
  "tumba",
  "soogitool",
  "toode",
  "model",
  "glb"
]);

export interface SimulatorModelMatch {
  fileName: string;
  filePath: string;
  url: string;
  normalizedName: string;
  signatureTokens: string[];
}

let modelIndexPromise: Promise<SimulatorModelMatch[]> | null = null;

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildSignatureTokens = (value: string): string[] =>
  [...new Set(
    normalizeForMatch(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !MODEL_TOKEN_STOP_WORDS.has(token))
  )];

const buildModelUrl = (fileName: string) => `${MODELS_BASE_URL}/${encodeURIComponent(fileName)}`;

const scoreModelMatch = (input: string, entry: SimulatorModelMatch): number => {
  const normalizedInput = normalizeForMatch(input);
  if (!normalizedInput) return -1;

  if (normalizedInput === entry.normalizedName) return 1000;
  if (normalizedInput.includes(entry.normalizedName) || entry.normalizedName.includes(normalizedInput)) {
    return 700;
  }

  const inputTokens = buildSignatureTokens(normalizedInput);
  if (inputTokens.length === 0 || entry.signatureTokens.length === 0) return -1;

  const overlap = inputTokens.filter((token) => entry.signatureTokens.includes(token));
  if (overlap.length === 0) return -1;

  return overlap.length * 100 - Math.abs(inputTokens.length - entry.signatureTokens.length) * 5;
};

const loadSimulatorModelIndexInternal = async (): Promise<SimulatorModelMatch[]> => {
  try {
    const fileNames = await fs.readdir(MODELS_DIR);
    return fileNames
      .filter((fileName) => fileName.toLowerCase().endsWith(".glb"))
      .map((fileName) => ({
        fileName,
        filePath: path.join(MODELS_DIR, fileName),
        url: buildModelUrl(fileName),
        normalizedName: normalizeForMatch(fileName),
        signatureTokens: buildSignatureTokens(fileName)
      }));
  } catch (error) {
    console.error("[simulator-models] Failed to read model directory:", error);
    return [];
  }
};

export const loadSimulatorModelIndex = async (): Promise<SimulatorModelMatch[]> => {
  if (!modelIndexPromise) {
    modelIndexPromise = loadSimulatorModelIndexInternal();
  }
  return modelIndexPromise;
};

export const findSimulatorModelMatch = async (input: string): Promise<SimulatorModelMatch | null> => {
  const normalizedInput = normalizeForMatch(input);
  if (!normalizedInput) return null;

  const entries = await loadSimulatorModelIndex();
  let best: SimulatorModelMatch | null = null;
  let bestScore = -1;

  for (const entry of entries) {
    const score = scoreModelMatch(normalizedInput, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return bestScore >= 100 ? best : null;
};

export const hasSimulatorModelMatch = async (input: string): Promise<boolean> =>
  Boolean(await findSimulatorModelMatch(input));
