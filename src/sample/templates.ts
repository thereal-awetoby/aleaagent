// Deterministic prose used in SAMPLE_MODE and whenever Nightshift is unavailable.
// Written for a first-time visitor: no rule codes in the first sentences, no jargon, numbers in plain units.

import { DOMAINS, NEWS_HEADLINES, fmtSpread, fmtValue } from "../domains.ts";
import type { DomainSpec } from "../domains.ts";
import type { Bundle, ErrorType } from "../types.ts";

function extremes(b: Bundle) {
  const v = b.readings.filter((r) => r.value !== null) as Array<{ source: string; value: number }>;
  const sorted = [...v].sort((a, c) => a.value - c.value);
  return { low: sorted[0], high: sorted[sorted.length - 1], count: v.length };
}

const CHAIN_NAMES: Record<string, string> = {
  eth: "Ethereum",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  base: "Base",
  bsc: "BNB Chain",
  optimism: "Optimism",
  avalanche: "Avalanche",
  sol: "Solana",
};

/** What is being checked, as a phrase that reads naturally in a sentence. */
export function subjectOf(b: Pick<Bundle, "domain" | "symbol" | "label" | "window">): string {
  const sym = b.symbol;
  const chain = CHAIN_NAMES[sym.split("-")[0]] ?? sym;
  switch (b.domain) {
    case "weather":
      if (b.window === "7d" || b.label.includes("7-day")) return `the 7-day average temperature in ${sym.replace(/_/g, " ")}`;
      return `the temperature in ${sym.replace(/_/g, " ")}`;
    case "defi":
      return `the gas price on ${chain}`;
    case "tvl":
      return `the total value locked on ${chain}`;
    case "forex":
      return `the ${sym} exchange rate`;
    case "sports":
      return `the home win probability for ${sym}`;
    case "news":
      return `whether ${NEWS_HEADLINES[sym] ?? sym}`;
    default:
      return `${sym}'s ${b.label}`;
  }
}

/** The allowed gap between sources, in words a visitor can follow. */
export function allowedGap(d: DomainSpec, tol: number): string {
  if (d.unit === "status") return "no difference: every source must give the same answer";
  if (d.tolKind === "rel") return `${+(tol * 100).toFixed(2)}% of the middle value`;
  if (d.unit === "pct") return `${tol.toFixed(1)} percentage ${tol === 1 ? "point" : "points"}`;
  if (d.unit === "c") return `${tol.toFixed(1)} °C`;
  return String(tol);
}

const missingNote = (b: Bundle) => {
  const miss = b.readings.filter((r) => r.value === null).map((r) => r.source);
  return miss.length ? ` (${miss.join(", ")} did not answer)` : "";
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One or two plain sentences on how well the sources support the claim. */
export function rationaleTemplate(b: Bundle, threshold: number | null): string {
  const d = DOMAINS[b.domain];
  const f = (n: number | null) => fmtValue(d.unit, n);
  const { low, high, count } = extremes(b);
  const subj = subjectOf(b);
  const spread = fmtSpread(d, b.spread, b.consensus);
  if (b.status === "conflict" && d.unit === "status") {
    return `We asked ${count} sources ${subj}, and they gave different answers: ${b.readings.map((r) => `${r.source} says ${f(r.value)}`).join(", ")}. A headline only stands when every source gives the same answer, so no single answer is given.`;
  }
  if (b.status === "conflict") {
    return `${sentence(subj)} was checked against ${count} sources and they do not agree: ${low.source} says ${f(low.value)} and ${high.source} says ${f(high.value)}, a gap of ${spread}, which is more than the ${allowedGap(d, b.tolerance)} allowed. Picking one or averaging them would hide that, so no single number is given.`;
  }
  if (b.status === "partial") {
    return `Only ${count} of ${b.readings.length} sources answered${missingNote(b)}, so ${subj} cannot be cross-checked. Alea does not make a claim from too few voices.`;
  }
  if (d.unit === "status") {
    return `All ${count} sources give the same answer on ${subj}: ${f(b.consensus)}.`;
  }
  if (threshold === null) {
    return `All ${count} sources agree on ${subj}, within ${spread} of each other. They put it at about ${f(b.consensus)}.`;
  }
  const margin = Number(((b.consensus ?? 0) - threshold).toFixed(4));
  return margin >= 0
    ? `All ${count} sources agree on ${subj}, within ${spread} of each other. They put it at about ${f(b.consensus)}, which is above the claimed ${f(threshold)}.`
    : `All ${count} sources agree on ${subj}, within ${spread} of each other, but they put it at about ${f(b.consensus)}, which is below the claimed ${f(threshold)}.`;
}

/** The confession as a short human paragraph. The technical record (ids, sources, rule text) sits beside it. */
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
  const subj = subjectOf(b);
  const lead = forced
    ? "Demo note: this outcome was forced on purpose. "
    : b.forced_conflict
      ? "Demo note: Force Conflict moved one live reading on purpose. "
      : "";
  if (errorType === "source_conflict" && d.unit === "status") {
    return `${lead}We asked ${count} sources ${subj}. They gave different answers (${b.readings.map((r) => `${r.source}: ${f(r.value)}`).join(", ")}), and we only accept a headline when every source agrees, so we did not publish one answer as the truth. We saved this confession and a rule (${ruleId}): next time the sources disagree on this headline, Alea will refuse and point back to this confession.`;
  }
  if (errorType === "source_conflict") {
    return `${lead}We asked ${count} sources for ${subj}. The lowest reading was ${f(low.value)} from ${low.source} and the highest was ${f(high.value)} from ${high.source}, a gap of ${fmtSpread(d, b.spread, b.consensus)}. We allow ${allowedGap(d, b.tolerance)}, so they did not agree closely enough, and we did not publish a single number as the truth. We saved this confession and a rule (${ruleId}): next time the same kind of disagreement appears on ${subj}, Alea will refuse and point back to this confession.`;
  }
  if (errorType === "partial_data") {
    return `${lead}We asked ${b.readings.length} sources for ${subj}, but only ${count} answered${missingNote(b)}. With so few answers there is nothing to cross-check against, so we did not make a claim. We saved this confession and a rule (${ruleId}): next time ${subj} comes back with sources missing, Alea will refuse and point back to this confession.`;
  }
  const t = threshold ?? b.consensus;
  const below = threshold !== null && b.consensus !== null && b.consensus < threshold;
  const what = below
    ? `We claimed that ${claim}, but the sources put ${subj} at about ${f(b.consensus)}, which does not back that up.`
    : `We claimed that ${claim}, but that claim was marked false for this run.`;
  return `${lead}${what} We saved this confession and a rule (${ruleId}): next time the same claim at ${f(t)} or higher is made while the sources sit below it, Alea will refuse and point back to this confession.`;
}
