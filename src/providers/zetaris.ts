// Zetaris adapter. One SQL surface over every source.
// Expects a table/view `alea_readings(source, symbol, metric, value)` registered in Zetaris
// and a REST endpoint that accepts a JSON body with the SQL string. See docs/zetaris.md.
// symbol and metric come from the fixed domain list in src/domains.ts, never from free text.

import { config } from "../config.ts";
import type { Reading } from "../types.ts";

export const zetarisConfigured = (): boolean => config.zetaris.endpoint !== "";

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.\-]/g, "");

export async function queryReadings(symbol: string, metric: string): Promise<{ readings: Reading[]; sql: string }> {
  const { endpoint, apiKey, table, sqlField } = config.zetaris;
  const sql = `SELECT source, value FROM ${table} WHERE symbol = '${safe(symbol)}' AND metric = '${safe(metric)}'`;
  const res = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ [sqlField]: sql }),
  });
  if (!res.ok) throw new Error(`Zetaris HTTP ${res.status}`);
  const j: any = await res.json();
  const rows: any[] = Array.isArray(j) ? j : (j.rows ?? j.data ?? j.results ?? []);
  const readings: Reading[] = rows.map((r) => {
    const source = String(Array.isArray(r) ? r[0] : r.source);
    const value = Number(Array.isArray(r) ? r[1] : r.value);
    return Number.isFinite(value) ? { source, value: Number(value.toPrecision(10)) } : { source, value: null, error: "not a number" };
  });
  return { readings, sql };
}
