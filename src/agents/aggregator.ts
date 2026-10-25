// Source Aggregator. Pulls the same metric from three sources and labels the bundle.
// It never averages away a disagreement and never invents a number.

import { config } from "../config.ts";
import { DOMAINS, sourcesFor, type DomainId } from "../domains.ts";
import { fixture } from "../sample/fixtures.ts";
import { fetchDirect, readSource } from "../providers/sources.ts";
import { queryReadings, zetarisConfigured } from "../providers/zetaris.ts";
import type { Bundle, Reading, Scenario, SourceStatus } from "../types.ts";

const round = (n: number, d = 6) => Number(n.toFixed(d));

/**
 * tolerance is in metric units when kind = "abs", or a share of the midpoint when kind = "rel".
 * spread is always returned in metric units.
 */
export function classify(readings: Reading[], tolerance: number, minSources: number, kind: "abs" | "rel" = "abs") {
  const vals = readings.map((r) => r.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return { status: "partial" as SourceStatus, spread: null, consensus: null };
  const s = [...vals].sort((a, b) => a - b);
  const spread = round(s[s.length - 1] - s[0]);
  const mid = Math.floor(s.length / 2);
  const consensus = round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
  const limit = kind === "rel" ? Math.abs(consensus) * tolerance : tolerance;
  const status: SourceStatus = vals.length < minSources ? "partial" : spread > limit + 1e-9 ? "conflict" : "aligned";
  return { status, spread, consensus };
}

/**
 * Live data cannot be told to disagree. When Force conflict is on in live mode and the real
 * readings agree, one reading is moved outside the tolerance and marked forced, so the demo
 * loop still works and the bundle says plainly that it was forced.
 */
function forceConflict(readings: Reading[], domain: DomainId): boolean {
  const d = DOMAINS[domain];
  const live = readings.filter((r) => r.value !== null);
  if (live.length < config.minSources) return false;
  const vals = live.map((r) => r.value as number);
  const mid = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  const step = (d.tolKind === "rel" ? Math.abs(mid) * d.tol : d.tol) * 3;
  const target = live[1];
  target.value = Number(((target.value as number) + step).toPrecision(8));
  target.forced = true;
  return true;
}

async function withRetry<T>(fn: () => Promise<T>, onRetry: () => void): Promise<T> {
  try {
    return await fn();
  } catch {
    onRetry();
    return fn();
  }
}

/** Zetaris rows can come back in any order; line them up with the domain's source list. */
function inDomainOrder(domain: DomainId, symbol: string, rows: Reading[]): Reading[] {
  return sourcesFor(domain, symbol).map(
    (s) => rows.find((r) => r.source === s.id) ?? { source: s.id, value: null, error: "not in Zetaris" },
  );
}

export async function aggregate(domain: DomainId, symbol: string, scenario: Scenario): Promise<Bundle> {
  const d = DOMAINS[domain];
  let readings: Reading[];
  let via: Bundle["via"];
  let query: string | undefined;
  let forced = false;
  let fallback: string | undefined;
  const retries: string[] = [];

  if (config.sample) {
    readings = fixture(domain, symbol, scenario);
    via = "fixture";
  } else {
    if (zetarisConfigured()) {
      try {
        const out = await withRetry(() => queryReadings(symbol, d.metric), () => retries.push("zetaris"));
        readings = inDomainOrder(domain, symbol, out.readings);
        query = out.sql;
        via = "zetaris";
      } catch (err) {
        fallback = `Zetaris unavailable (${(err as Error).message.slice(0, 80)}), read the sources directly`;
        readings = await fetchDirect(domain, symbol);
        via = "direct";
      }
    } else {
      readings = await fetchDirect(domain, symbol);
      via = "direct";
    }
    // Retry each failed live source once. A missing key is not retried: it cannot succeed.
    if (via === "direct") {
      readings = await Promise.all(
        readings.map(async (r) => {
          if (r.value !== null || r.error === "no key") return r;
          retries.push(r.source);
          return readSource(domain, symbol, r.source);
        }),
      );
    }
    if (scenario === "conflict" && classify(readings, d.tol, config.minSources, d.tolKind).status === "aligned") {
      forced = forceConflict(readings, domain);
    }
  }

  const { status, spread, consensus } = classify(readings, d.tol, config.minSources, d.tolKind);
  return {
    domain,
    symbol,
    metric: d.metric,
    label: d.label,
    readings,
    status,
    spread,
    consensus,
    tolerance: d.tol,
    tolerance_kind: d.tolKind,
    via,
    query,
    ...(forced ? { forced_conflict: true } : {}),
    ...(retries.length ? { retries } : {}),
    ...(fallback ? { fallback } : {}),
  };
}
