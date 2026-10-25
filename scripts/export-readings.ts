// Writes data/readings.csv from the live public sources, in the shape Zetaris expects:
// source,symbol,metric,value,captured_at. Register the CSV as a table named alea_readings.

import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";
import { DOMAIN_IDS, DOMAINS } from "../src/domains.ts";
import { fetchDirect } from "../src/providers/sources.ts";

const rows = ["source,symbol,metric,value,captured_at"];
const at = new Date().toISOString();
for (const domain of DOMAIN_IDS) {
  for (const symbol of DOMAINS[domain].symbols) {
    for (const r of await fetchDirect(domain, symbol)) {
      if (r.value !== null) rows.push(`${r.source},${symbol},${DOMAINS[domain].metric},${r.value},${at}`);
      else console.warn(`skipped ${domain}/${symbol} ${r.source}: ${r.error}`);
    }
  }
}
fs.mkdirSync(config.dataDir, { recursive: true });
const out = path.join(config.dataDir, "readings.csv");
fs.writeFileSync(out, rows.join("\n") + "\n", "utf-8");
console.log(`wrote ${rows.length - 1} rows to ${out}`);
