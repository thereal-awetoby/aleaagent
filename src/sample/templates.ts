// Deterministic prose used in SAMPLE_MODE and whenever Nightshift is unavailable.

import type { Bundle, ErrorType } from "../types.ts";

const pct = (n: number | null) => (n === null ? "n/a" : `${n}%`);

function extremes(b: Bundle) {
  const v = b.readings.filter((r) => r.value !== null) as Array<{ source: string; value: number }>;
  const sorted = [...v].sort((a, c) => a.value - c.value);
  return { low: sorted[0], high: sorted[sorted.length - 1], count: v.length };
}

export function rationaleTemplate(b: Bundle, threshold: number): string {
  const { low, high, count } = extremes(b);
  if (b.status === "conflict") {
    return `Sources disagree by ${b.spread} pp, above the ${b.tolerance} pp tolerance. ${low.source} reads ${pct(low.value)} and ${high.source} reads ${pct(high.value)}. Averaging them would hide that.`;
  }
  if (b.status === "partial") {
    return `Only ${count} of ${b.readings.length} sources returned a value, so the claim cannot be checked across sources.`;
  }
  const margin = Number(((b.consensus ?? 0) - threshold).toFixed(2));
  return margin >= 0
    ? `All ${count} sources agree within ${b.spread} pp. Consensus is ${pct(b.consensus)}, ${margin} pp above the claimed ${threshold}%.`
    : `All ${count} sources agree within ${b.spread} pp, but consensus is ${pct(b.consensus)}, ${Math.abs(margin)} pp below the claimed ${threshold}%.`;
}

export function confessionTemplate(args: {
  bundle: Bundle;
  claim: string;
  errorType: ErrorType;
  ruleId: string;
  threshold: number;
  forced: boolean;
}): string {
  const { bundle: b, claim, errorType, ruleId, threshold, forced } = args;
  const { low, high, count } = extremes(b);
  const lead = forced ? "The outcome was forced to false for this run. " : "";
  if (errorType === "source_conflict") {
    return `${lead}I asserted that ${claim} while ${low.source} reported ${pct(low.value)} and ${high.source} reported ${pct(high.value)}. I should have refused to choose between them. ${ruleId} stops me from making this claim while sources conflict.`;
  }
  if (errorType === "partial_data") {
    return `${lead}I asserted that ${claim} with only ${count} of ${b.readings.length} sources responding. ${ruleId} stops me from making this claim on partial data.`;
  }
  return `${lead}I asserted that ${claim}, but the consensus across aligned sources was ${pct(b.consensus)}. The data did not support that threshold. ${ruleId} blocks claims at or above ${threshold}% while consensus sits below the claim.`;
}
