// Claim Agent. Numbers and confidence are computed. The language model, when available,
// only writes the one-line rationale. It places no trades and spends nothing.

import { config } from "../config.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { rationaleTemplate } from "../sample/templates.ts";
import type { Author, Bundle, Claim } from "../types.ts";

const fmt = (n: number) => `${n >= 0 ? "+" : ""}${Number(n.toFixed(2))}`;

export const claimText = (symbol: string, threshold: number) => `${symbol} 24h change is above ${fmt(threshold)}% across sources`;

export function confidenceFor(b: Bundle, threshold: number): number {
  if (b.status === "conflict") return 0.42;
  if (b.status === "partial") return 0.5;
  const margin = (b.consensus ?? 0) - threshold;
  return margin <= 0 ? 0.35 : Number((0.6 + 0.3 * Math.min(margin / 2, 1)).toFixed(2));
}

const SYSTEM =
  "You are the claim agent in a cross-checking system. Write one or two plain sentences explaining how well the sources support the claim. " +
  "Use only the numbers provided. No hype, no advice, no markdown.";

export async function makeClaim(b: Bundle, threshold: number, cycleId: string): Promise<Claim> {
  let rationale = rationaleTemplate(b, threshold);
  let author: Author = "template";
  if (!config.sample && nightshiftConfigured()) {
    const out = await complete(
      SYSTEM,
      JSON.stringify({ claim: claimText(b.symbol, threshold), status: b.status, readings: b.readings, spread: b.spread, consensus: b.consensus, tolerance: b.tolerance }),
    );
    if (out) {
      rationale = out.slice(0, 400);
      author = "nightshift";
    }
  }
  return {
    claim_id: `cl_${cycleId}`,
    text: claimText(b.symbol, threshold),
    symbol: b.symbol,
    metric: b.metric,
    threshold,
    confidence: confidenceFor(b, threshold),
    rationale,
    author,
  };
}
