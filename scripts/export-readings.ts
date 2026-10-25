// Writes data/readings.csv in the shape Zetaris expects: source,symbol,metric,value,captured_at.
// Register the CSV in Zetaris as the table alea_readings (see docs/zetaris.md).
//
//   npm run export:readings              live public sources (keys from .env; missing keys are skipped)
//   npm run export:readings -- --sample  the offline fixtures (aligned readings), no network, no keys

import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";
import { DOMAIN_IDS, DOMAINS } from "../src/domains.ts";
import { fixture } from "../src/sample/fixtures.ts";
import { fetchDirect, readSource } from "../src/providers/sources.ts";

const sample = process.argv.includes("--sample");
const rows = ["source,symbol,metric,value,captured_at"];
const at = new Date().toISOString();
// Free tiers (CoinGecko in particular) rate-limit bursts with HTTP 429. Those readings are
// collected and retried in rounds after a pause instead of being dropped.
const RETRY_WAIT_MS = Number(process.env.EXPORT_RETRY_MS ?? 30000);
const RETRY_ROUNDS = 6;
type Retry = { domain: (typeof DOMAIN_IDS)[number]; symbol: string; source: string };
const limited: Retry[] = [];
const row = (symbol: string, domain: (typeof DOMAIN_IDS)[number], source: string, value: number) =>
  rows.push(`${source},${symbol},${DOMAINS[domain].metric},${value},${at}`);

for (const domain of DOMAIN_IDS) {
  for (const symbol of DOMAINS[domain].symbols) {
    const readings = sample ? fixture(domain, symbol, "aligned") : await fetchDirect(domain, symbol);
    for (const r of readings) {
      if (r.value !== null) row(symbol, domain, r.source, r.value);
      else if (r.error === "HTTP 429") limited.push({ domain, symbol, source: r.source });
      else console.warn(`skipped ${domain}/${symbol} ${r.source}: ${r.error}`);
    }
  }
}
for (let round = 1; limited.length > 0 && round <= RETRY_ROUNDS; round++) {
  console.log(`rate limited on ${limited.length} reading(s), waiting ${Math.round(RETRY_WAIT_MS / 1000)}s (retry ${round} of ${RETRY_ROUNDS})`);
  await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
  for (const item of limited.splice(0)) {
    const r = await readSource(item.domain, item.symbol, item.source);
    if (r.value !== null) row(item.symbol, item.domain, r.source, r.value);
    else if (r.error === "HTTP 429") limited.push(item);
    else console.warn(`skipped ${item.domain}/${item.symbol} ${item.source}: ${r.error}`);
  }
}
for (const item of limited) console.warn(`skipped ${item.domain}/${item.symbol} ${item.source}: HTTP 429 after ${RETRY_ROUNDS} retries`);
fs.mkdirSync(config.dataDir, { recursive: true });
const out = path.join(config.dataDir, "readings.csv");
fs.writeFileSync(out, rows.join("\n") + "\n", "utf-8");
console.log(`wrote ${rows.length - 1} ${sample ? "sample" : "live"} rows to ${out}`);
