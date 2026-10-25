// Zetaris adapter. One SQL surface over every source.
// REST contract from the Participant Setup Guide (1.9) and its smoke_test.py:
//   POST {ZETARIS_REST_URL}/sql-editor/sqls/run
//   headers: Authorization: Bearer <ZETARIS_API_KEY>, X-Org-ID, X-Request-ID (fresh UUID)
//   body:    { queryId, sql, source: "SqlEditor", limit }
//   reply:   { data: [[col1, col2, ...], ...] }
// Alea expects a table `alea_readings(source, symbol, metric, value)`. See docs/zetaris.md.
// symbol and metric come from the fixed domain list in src/domains.ts, never from free text.

import { randomUUID } from "node:crypto";
import { config } from "../config.ts";
import type { Reading } from "../types.ts";

export const zetarisConfigured = (): boolean => config.zetaris.restUrl !== "" && config.zetaris.apiKey !== "";

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.\-]/g, "");

/** Run one SQL statement and return its rows. Errors never include the key. */
export async function runSql(sql: string, limit = 100): Promise<any[][]> {
  const { restUrl, orgId, apiKey } = config.zetaris;
  const res = await fetch(`${restUrl}/sql-editor/sqls/run`, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "X-Org-ID": orgId,
      "X-Request-ID": randomUUID(),
    },
    body: JSON.stringify({ queryId: randomUUID(), sql, source: "SqlEditor", limit }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 120).split(apiKey).join("***");
    throw new Error(`Zetaris HTTP ${res.status}${body ? `: ${body}` : ""}`);
  }
  const j: any = await res.json();
  const rows = j.data ?? j.rows ?? j.results ?? [];
  if (!Array.isArray(rows)) throw new Error("Zetaris reply has no data array");
  return rows.map((r: any) => (Array.isArray(r) ? r : Object.values(r)));
}

export function readingsSql(symbol: string, metric: string): string {
  return `SELECT source, value FROM ${config.zetaris.table} WHERE symbol = '${safe(symbol)}' AND metric = '${safe(metric)}'`;
}

export async function queryReadings(symbol: string, metric: string): Promise<{ readings: Reading[]; sql: string }> {
  const sql = readingsSql(symbol, metric);
  const rows = await runSql(sql);
  const readings: Reading[] = rows.map((r) => {
    const source = String(r[0]);
    const value = Number(r[1]);
    return Number.isFinite(value) ? { source, value: Number(value.toPrecision(10)) } : { source, value: null, error: "not a number" };
  });
  return { readings, sql };
}
