// Writes data/readings.csv from the live public sources, in the shape Zetaris expects:
// source,symbol,metric,value,captured_at. Register the CSV as a table named alea_readings.

import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";
import { fetchDirect } from "../src/providers/sources.ts";

const rows = ["source,symbol,metric,value,captured_at"];
const at = new Date().toISOString();
for (const symbol of ["BTC", "ETH"] as const) {
  for (const r of await fetchDirect(symbol)) {
    if (r.value !== null) rows.push(`${r.source},${symbol},change_24h,${r.value},${at}`);
    else console.warn(`skipped ${r.source} ${symbol}: ${r.error}`);
  }
}
fs.mkdirSync(config.dataDir, { recursive: true });
const out = path.join(config.dataDir, "readings.csv");
fs.writeFileSync(out, rows.join("\n") + "\n", "utf-8");
console.log(`wrote ${rows.length - 1} rows to ${out}`);
