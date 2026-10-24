// Source Aggregator. Pulls the same metric from at least three sources and labels the bundle.
// It never averages away a disagreement and never invents a number.

import { config } from "../config.ts";
import { FIXTURES } from "../sample/fixtures.ts";
import { fetchDirect } from "../providers/sources.ts";
import { queryReadings, zetarisConfigured } from "../providers/zetaris.ts";
import type { Asset, Bundle, Reading, Scenario, SourceStatus } from "../types.ts";

const round = (n: number) => Number(n.toFixed(2));

export function classify(readings: Reading[], tolerance: number, minSources: number) {
  const vals = readings.map((r) => r.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return { status: "partial" as SourceStatus, spread: null, consensus: null };
  const s = [...vals].sort((a, b) => a - b);
  const spread = round(s[s.length - 1] - s[0]);
  const mid = Math.floor(s.length / 2);
  const consensus = round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
  const status: SourceStatus = vals.length < minSources ? "partial" : spread > tolerance ? "conflict" : "aligned";
  return { status, spread, consensus };
}

export async function aggregate(symbol: Asset, scenario: Scenario): Promise<Bundle> {
  let readings: Reading[];
  let via: Bundle["via"];
  let query: string | undefined;

  if (config.sample) {
    readings = FIXTURES[symbol][scenario].map((r) => ({ ...r }));
    via = "fixture";
  } else if (zetarisConfigured()) {
    const out = await queryReadings(symbol);
    readings = out.readings;
    query = out.sql;
    via = "zetaris";
  } else {
    readings = await fetchDirect(symbol);
    via = "direct";
  }

  const { status, spread, consensus } = classify(readings, config.tolerance, config.minSources);
  return { symbol, metric: "change_24h", readings, status, spread, consensus, tolerance: config.tolerance, via, query };
}
