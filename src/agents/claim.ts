// Claim Agent. Numbers and confidence are computed. The language model, when available,
// only writes the one-line rationale. It places no trades and spends nothing.

import { config } from "../config.ts";
import { DOMAINS, NEWS_HEADLINES, fmtValue, type DomainId } from "../domains.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { review } from "./judge.ts";
import { plainFacts, rationaleChecks } from "./facts.ts";
import { rationaleTemplate } from "../sample/templates.ts";
import type { Author, Bundle, Claim } from "../types.ts";
import type { JudgeResult } from "./judge.ts";

/** Threshold claim ("is above X") when a threshold is given, otherwise a point claim ("is about X"). */
export function claimText(domain: DomainId, symbol: string, threshold: number | null, consensus: number | null = null): string {
  const d = DOMAINS[domain];
  if (d.unit === "status") return `"${NEWS_HEADLINES[symbol] ?? symbol}" is ${fmtValue(d.unit, consensus)} across sources`;
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
  "Write one or two short sentences in plain English for a first-time visitor. Say what was checked, using the what_was_checked phrase; " +
  "what the sources reported, naming any that did not answer; how far apart they were compared with the allowed gap, in the units given; " +
  "and what that means: when they agree, the claim stands; when they do not, no single number is given. " +
  "Copy numbers exactly as written in the facts. No internal codes, no rule ids, no jargon, no hype, no advice, no markdown. " +
  "When the allowed gap or how_far_apart is a percentage of the midpoint, say 'X% of the midpoint'; never say 'percentage points' for that kind of gap.";

export async function makeClaim(b: Bundle, threshold: number | null, cycleId: string): Promise<Claim> {
  const text = claimText(b.domain, b.symbol, threshold, b.consensus);
  let rationale = rationaleTemplate(b, threshold);
  let author: Author = "template";
  let model = "template";
  let judge: JudgeResult | undefined;
  if (!config.sample && nightshiftConfigured()) {
    const facts = { claim: text, ...plainFacts(b) };
    const user = JSON.stringify(facts);
    const out = await complete(SYSTEM, user);
    if (out) {
      const r = await review({ draft: out, facts, checks: rationaleChecks(b), rewrite: (critique) => complete(SYSTEM, `${user}\n\n${critique}`) });
      judge = r.judge;
      if (r.text) {
        rationale = r.text.slice(0, 500);
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
