// Deterministic prose used in SAMPLE_MODE and whenever Nightshift is unavailable.

import { DOMAINS, fmtSpread, fmtValue, tolText } from "../domains.ts";
import type { Bundle, ErrorType } from "../types.ts";

function extremes(b: Bundle) {
  const v = b.readings.filter((r) => r.value !== null) as Array<{ source: string; value: number }>;
  const sorted = [...v].sort((a, c) => a.value - c.value);
  return { low: sorted[0], high: sorted[sorted.length - 1], count: v.length };
}

export function rationaleTemplate(b: Bundle, threshold: number | null): string {
  const d = DOMAINS[b.domain];
  const f = (n: number | null) => fmtValue(d.unit, n);
  const { low, high, count } = extremes(b);
  const spread = fmtSpread(d, b.spread, b.consensus);
  if (b.status === "conflict") {
    return `Sources disagree by ${spread}. ${tolText(d)} ${low.source} reads ${f(low.value)} and ${high.source} reads ${f(high.value)}. Averaging them would hide that.`;
  }
  if (b.status === "partial") {
    return `Only ${count} of ${b.readings.length} sources returned a value, so the claim cannot be checked across sources.`;
  }
  if (threshold === null) {
    return `All ${count} sources agree within ${spread}. Consensus is ${f(b.consensus)}.`;
  }
  const margin = Number(((b.consensus ?? 0) - threshold).toFixed(4));
  return margin >= 0
    ? `All ${count} sources agree within ${spread}. Consensus is ${f(b.consensus)}, above the claimed ${f(threshold)}.`
    : `All ${count} sources agree within ${spread}, but consensus is ${f(b.consensus)}, below the claimed ${f(threshold)}.`;
}

export function confessionTemplate(args: {
  bundle: Bundle;
  claim: string;
  errorType: ErrorType;
  ruleId: string;
  threshold: number | null;
  forced: boolean;
}): string {
  const { bundle: b, claim, errorType, ruleId, threshold, forced } = args;
  const d = DOMAINS[b.domain];
  const f = (n: number | null) => fmtValue(d.unit, n);
  const { low, high, count } = extremes(b);
  const lead = forced ? "The outcome was forced to false for this run. " : b.forced_conflict ? "Force conflict skewed one live reading for this run. " : "";
  if (errorType === "source_conflict") {
    return `${lead}I was asked to claim that ${claim} while ${low.source} reported ${f(low.value)} and ${high.source} reported ${f(high.value)}. I should not choose between them. ${ruleId} stops me from making this claim while sources conflict.`;
  }
  if (errorType === "partial_data") {
    return `${lead}I was asked to claim that ${claim} with only ${count} of ${b.readings.length} sources responding. ${ruleId} stops me from making this claim on partial data.`;
  }
  return `${lead}I asserted that ${claim}, but the consensus across aligned sources was ${f(b.consensus)}. The data did not support that. ${ruleId} blocks claims at or above ${f(threshold)} while consensus sits below the claim.`;
}
