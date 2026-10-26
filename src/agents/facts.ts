// Plain-English facts for Nemotron. The model gets the same building blocks the SAMPLE templates use
// (subject phrase, readings in plain units, the allowed gap in words), so live prose meets the same bar.
// Also: code checks the judge runs on every draft, for the rules that must never be broken.

import { DOMAINS, fmtSpread, fmtValue } from "../domains.ts";
import { allowedGap, subjectOf } from "../sample/templates.ts";
import type { Bundle, ErrorType } from "../types.ts";

export function plainFacts(b: Bundle) {
  const d = DOMAINS[b.domain];
  const missing = b.readings.filter((r) => r.value === null);
  return {
    what_was_checked: subjectOf(b),
    sources_reported: b.readings.map((r) => ({
      source: r.source,
      reported: r.value === null ? `did not answer (${r.error ?? "no value"})` : fmtValue(d.unit, r.value),
      ...(r.forced ? { note: "moved on purpose by Force Conflict for the demo" } : {}),
    })),
    sources_that_did_not_answer: missing.map((r) => r.source),
    how_far_apart: fmtSpread(d, b.spread, b.consensus),
    allowed_gap: allowedGap(d, b.tolerance),
    middle_value: fmtValue(d.unit, b.consensus),
    result: b.status === "aligned" ? "the sources agreed" : b.status === "conflict" ? "the sources disagreed by more than the allowed gap" : "too few sources answered",
  };
}

export function whatWentWrong(errorType: ErrorType): string {
  if (errorType === "source_conflict") return "the sources disagreed by more than the allowed gap, so we did not publish a single number as the truth";
  if (errorType === "partial_data") return "too few sources answered to cross-check, so we did not make a claim";
  return "the claim did not hold against the sources";
}

const firstSentence = (t: string) => (t.match(/^[\s\S]*?[.!?](\s|$)/)?.[0] ?? t).trim();

/** Rules a live rationale must follow (checked in code, before the model judge). */
export function rationaleChecks(b: Bundle) {
  return (text: string): string[] => {
    const issues: string[] = [];
    const missing = b.readings.filter((r) => r.value === null).map((r) => r.source);
    for (const m of missing) if (!text.includes(m)) issues.push(`say that ${m} did not answer`);
    if (/\bR-[A-Z]+-\d+\b/.test(text)) issues.push("leave rule ids out of the explanation");
    return issues;
  };
}

/** Rules a live confession must follow: human sentences first, rule id after, and the "next time" promise. */
export function confessionChecks(b: Bundle, ruleId: string) {
  return (text: string): string[] => {
    const issues: string[] = [];
    if (firstSentence(text).includes(ruleId) || /^\s*R-[A-Z]+-\d+/.test(text)) issues.push(`put the rule id ${ruleId} after the plain-English sentences, not in the first sentence`);
    if (!/next time|in future|from now on/i.test(text)) issues.push("say that next time the same pattern appears, Alea will refuse and point back to this confession");
    const missing = b.readings.filter((r) => r.value === null).map((r) => r.source);
    for (const m of missing) if (!text.includes(m)) issues.push(`say that ${m} did not answer`);
    return issues;
  };
}
