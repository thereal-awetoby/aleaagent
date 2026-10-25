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
import { fetchDirect } from "../src/providers/sources.ts";

const sample = process.argv.includes("--sample");
const rows = ["source,symbol,metric,value,captured_at"];
const at = new Date().toISOString();
for (const domain of DOMAIN_IDS) {
  for (const symbol of DOMAINS[domain].symbols) {
    const readings = sample ? fixture(domain, symbol, "aligned") : await fetchDirect(domain, symbol);
    for (const r of readings) {
      if (r.value !== null) rows.push(`${r.source},${symbol},${DOMAINS[domain].metric},${r.value},${at}`);
      else console.warn(`skipped ${domain}/${symbol} ${r.source}: ${r.error}`);
    }
  }
}
fs.mkdirSync(config.dataDir, { recursive: true });
const out = path.join(config.dataDir, "readings.csv");
fs.writeFileSync(out, rows.join("\n") + "\n", "utf-8");
console.log(`wrote ${rows.length - 1} ${sample ? "sample" : "live"} rows to ${out}`);
