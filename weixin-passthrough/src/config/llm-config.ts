import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../../config/llm-config.json");

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional imgbb API key for image uploads. Get free key at https://api.imgbb.com */
  imgbbApiKey?: string;
};

/**
 * Load LLM config from disk on every call (hot-reload: no restart needed after UI save).
 */
export function loadLlmConfig(): LlmConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as LlmConfig;
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) {
      throw new Error("llm-config.json is missing required fields (baseUrl, apiKey, model)");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to load LLM config from ${CONFIG_PATH}: ${String(err)}`);
  }
}
