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
  // Meterless Nightshift Runtime (guide 4.5). Older NIGHTSHIFT_* names still work.
  nightshift: {
    baseUrl: (text(process.env.METERLESS_BASE_URL) || text(process.env.NIGHTSHIFT_BASE_URL)).replace(/\/+$/, ""),
    apiKey: text(process.env.METERLESS_RUNTIME_TOKEN) || text(process.env.NIGHTSHIFT_API_KEY),
    model: text(process.env.METERLESS_MODEL) || text(process.env.NIGHTSHIFT_MODEL) || "meterless/auto",
    app: text(process.env.METERLESS_APP) || "alea-agent",
    /** Route for the judge step. Defaults to METERLESS_MODEL; set it to a Nemotron route to pin the judge to Nemotron. */
    judgeModel: text(process.env.METERLESS_JUDGE_MODEL),
    /** How long one Nightshift call may take. Fast routes answer in seconds; raise this only for large models like Nemotron Ultra. */
    timeoutMs: Number(process.env.METERLESS_TIMEOUT_MS) > 0 ? Number(process.env.METERLESS_TIMEOUT_MS) : 45000,
  },
  // Zetaris REST (guide 1.9): POST {restUrl}/sql-editor/sqls/run with Bearer key, X-Org-ID, X-Request-ID.
  zetaris: {
    restUrl: text(process.env.ZETARIS_REST_URL).replace(/\/+$/, ""),
    orgId: text(process.env.ZETARIS_ORG_ID) || "1",
    apiKey: text(process.env.ZETARIS_API_KEY),
    table: text(process.env.ZETARIS_TABLE) || "alea_readings",
  },
};
