// npm run check: is everything connected? Mirrors the guide's smoke_test.py.
// Prints PASS / FAIL / SKIP per check. Never prints keys or tokens.

import { config } from "../src/config.ts";
import { DOMAIN_IDS, DOMAINS, keyValue } from "../src/domains.ts";
import { getEngine } from "../src/engine.ts";
import { complete, listModels, nightshiftConfigured } from "../src/providers/nightshift.ts";
import { runSql, zetarisConfigured } from "../src/providers/zetaris.ts";

const lines: string[] = [];
const out = (status: "PASS" | "FAIL" | "SKIP" | "INFO", name: string, detail = "") => lines.push(`${status.padEnd(4)}  ${name}${detail ? `  (${detail})` : ""}`);

async function check(name: string, fn: () => Promise<string | void>) {
  try {
    out("PASS", name, (await fn()) || "");
  } catch (err) {
    out("FAIL", name, String((err as Error).message ?? err).slice(0, 150));
  }
}

out("INFO", "mode", config.sample ? "SAMPLE_MODE=true (fixtures; live checks below still run if configured)" : "live");

// Meterless H-MEM
await check("Meterless H-MEM engine", async () => {
  const e = await getEngine();
  if (e.source !== "vendor/hmem") throw new Error("not installed, run: npm run setup");
  return "vendor/hmem";
});

// Zetaris
if (!zetarisConfigured()) out("SKIP", "Zetaris", "set ZETARIS_REST_URL and ZETARIS_API_KEY in .env");
else {
  await check("Zetaris runs SQL over its REST API", async () => {
    const rows = await runSql("SELECT 1", 1);
    if (String(rows?.[0]?.[0]) !== "1") throw new Error("unexpected reply");
    return config.zetaris.restUrl;
  });
  await check(`Zetaris table ${config.zetaris.table}`, async () => {
    const rows = await runSql(`SELECT metric, COUNT(*) FROM ${config.zetaris.table} GROUP BY metric`, 50);
    if (!rows.length) throw new Error("table is empty");
    return rows.map((r) => `${r[0]}=${r[1]}`).join(", ");
  });
}

// Nightshift
if (!nightshiftConfigured()) out("SKIP", "Meterless Nightshift", "set METERLESS_BASE_URL and METERLESS_RUNTIME_TOKEN in .env");
else {
  await check("Nightshift lists models (GET /v1/models)", async () => {
    const ids = await listModels();
    if (!ids.length) throw new Error("no models exposed");
    return ids.slice(0, 6).join(", ");
  });
  await check("Nightshift replies (POST /v1/chat/completions)", async () => {
    const r = await complete("Reply with one word.", "Reply with the single word: ready");
    if (!r) throw new Error("no reply after retry");
    return `requested ${config.nightshift.model}, answered by ${r.model}`;
  });
}

// Optional source keys
for (const d of DOMAIN_IDS) {
  for (const s of DOMAINS[d].sources) {
    if (s.key) out("INFO", `${d}/${s.id} key`, keyValue(s.key) ? "set" : "not set, shows 'no key' in live mode");
  }
}

console.log("\nAlea connection check\n" + lines.join("\n") + "\n");
process.exit(lines.some((l) => l.startsWith("FAIL")) ? 1 : 0);
