import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(): void {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const flag = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined || v.trim() === "" ? fallback : !["false", "0", "no", "off"].includes(v.trim().toLowerCase());

const text = (v: string | undefined): string => (v ?? "").trim();

export const config = {
  sample: flag(process.env.SAMPLE_MODE, true),
  port: Number(process.env.PORT ?? 8000),
  // 127.0.0.1 = only this computer can open the app. Set HOST=0.0.0.0 to share on your network.
  host: text(process.env.HOST) || "127.0.0.1",
  tolerance: Number(process.env.SPREAD_TOLERANCE ?? 1.0),
  minSources: 3,
  dataDir: process.env.ALEA_DATA_DIR ? path.resolve(process.env.ALEA_DATA_DIR) : path.join(ROOT, "data"),
  logDir: process.env.ALEA_LOG_DIR ? path.resolve(process.env.ALEA_LOG_DIR) : path.join(ROOT, "logs"),
  coingeckoBase: text(process.env.COINGECKO_BASE) || "https://api.coingecko.com/api/v3",
  nightshift: {
    baseUrl: text(process.env.NIGHTSHIFT_BASE_URL).replace(/\/+$/, ""),
    apiKey: text(process.env.NIGHTSHIFT_API_KEY),
    model: text(process.env.NIGHTSHIFT_MODEL) || "default",
  },
  zetaris: {
    endpoint: text(process.env.ZETARIS_ENDPOINT),
    apiKey: text(process.env.ZETARIS_API_KEY),
    table: text(process.env.ZETARIS_TABLE) || "alea_readings",
    sqlField: text(process.env.ZETARIS_SQL_FIELD) || "sql",
  },
};
