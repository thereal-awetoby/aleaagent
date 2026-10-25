// Claim Agent. Numbers and confidence are computed. The language model, when available,
// only writes the one-line rationale. It places no trades and spends nothing.

import { config } from "../config.ts";
import { DOMAINS, fmtValue, type DomainId } from "../domains.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { rationaleTemplate } from "../sample/templates.ts";
import type { Author, Bundle, Claim } from "../types.ts";

/** Threshold claim ("is above X") when a threshold is given, otherwise a point claim ("is about X"). */
export function claimText(domain: DomainId, symbol: string, threshold: number | null, consensus: number | null = null): string {
  const d = DOMAINS[domain];
  if (threshold !== null) return `${symbol} ${d.label} is above ${fmtValue(d.unit, threshold)} across sources`;
  return `${symbol} ${d.label} is about ${fmtValue(d.unit, consensus)} across sources`;
}

export function confidenceFor(b: Bundle, threshold: number | null): number {
  if (b.status === "conflict") return 0.42;
  if (b.status === "partial") return 0.5;
  if (threshold === null) return 0.85;
  const margin = (b.consensus ?? 0) - threshold;
  const unit = b.tolerance_kind === "rel" ? Math.abs(b.consensus ?? 1) * b.tolerance : b.tolerance;
  return margin <= 0 ? 0.35 : Number((0.6 + 0.3 * Math.min(margin / (2 * unit), 1)).toFixed(2));
}

const SYSTEM =
  "You are the claim agent in a cross-checking system. Write one or two plain sentences explaining how well the sources support the claim. " +
  "Use only the numbers provided. No hype, no advice, no markdown.";

export async function makeClaim(b: Bundle, threshold: number | null, cycleId: string): Promise<Claim> {
  const text = claimText(b.domain, b.symbol, threshold, b.consensus);
  let rationale = rationaleTemplate(b, threshold);
  let author: Author = "template";
  if (!config.sample && nightshiftConfigured()) {
    const out = await complete(
      SYSTEM,
      JSON.stringify({ claim: text, status: b.status, readings: b.readings, spread: b.spread, consensus: b.consensus, tolerance: b.tolerance, tolerance_kind: b.tolerance_kind }),
    );
    if (out) {
      rationale = out.slice(0, 400);
      author = "nightshift";
    }
  }
  return {
    claim_id: `cl_${cycleId}`,
    text,
    domain: b.domain,
    symbol: b.symbol,
    metric: b.metric,
    threshold,
    confidence: confidenceFor(b, threshold),
    rationale,
    author,
  };
}
