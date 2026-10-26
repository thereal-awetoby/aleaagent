// Claim Agent. Numbers and confidence are computed. The language model, when available,
// only writes the one-line rationale. It places no trades and spends nothing.

import { config } from "../config.ts";
import { DOMAINS, fmtValue, type DomainId } from "../domains.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { review } from "./judge.ts";
import { rationaleTemplate } from "../sample/templates.ts";
import type { Author, Bundle, Claim } from "../types.ts";
import type { JudgeResult } from "./judge.ts";

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
  "You are the claim agent in Alea, which reads the same fact from several independent sources before saying anything. " +
  "Write one or two short sentences, in plain English for a first-time visitor, saying how closely the sources agreed and what that means for the claim. " +
  "Use only the numbers provided. No internal codes, no jargon, no hype, no advice, no markdown.";

export async function makeClaim(b: Bundle, threshold: number | null, cycleId: string): Promise<Claim> {
  const text = claimText(b.domain, b.symbol, threshold, b.consensus);
  let rationale = rationaleTemplate(b, threshold);
  let author: Author = "template";
  let model = "template";
  let judge: JudgeResult | undefined;
  if (!config.sample && nightshiftConfigured()) {
    const facts = { claim: text, status: b.status, readings: b.readings, spread: b.spread, consensus: b.consensus, tolerance: b.tolerance, tolerance_kind: b.tolerance_kind };
    const user = JSON.stringify(facts);
    const out = await complete(SYSTEM, user);
    if (out) {
      const r = await review({ draft: out, facts, rewrite: (critique) => complete(SYSTEM, `${user}\n\n${critique}`) });
      judge = r.judge;
      if (r.text) {
        rationale = r.text.slice(0, 400);
        author = "nightshift";
        model = r.model;
      }
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
    model,
    ...(judge ? { judge } : {}),
  };
}
