// Confessor Agent. Checks active rules before a claim is made, scores the claim after,
// and on failure writes a structured confession, emits a rule and stores both in H-MEM.

import { config } from "../config.ts";
import { DOMAINS, fmtValue } from "../domains.ts";
import { getEngine } from "../engine.ts";
import { confessions, nextConfessionId, nextRuleId, rules } from "../memory/store.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { confessionTemplate } from "../sample/templates.ts";
import { review, type JudgeResult } from "./judge.ts";
import type { Author, Bundle, Claim, Confession, ErrorType, Recall, Rule, Trigger } from "../types.ts";

export interface RuleMatch {
  rule: Rule;
  confession?: Confession;
  recall: Recall;
}

function triggered(t: Trigger, b: Bundle, threshold: number | null): boolean {
  if (t.kind === "source_status") return b.status === t.status;
  return threshold !== null && b.consensus !== null && threshold >= t.threshold && b.consensus < threshold;
}

export async function checkRules(b: Bundle, threshold: number | null): Promise<RuleMatch | null> {
  const hit = rules
    .all()
    .find(
      (r) => r.shape.domain === b.domain && r.shape.symbol === b.symbol && r.shape.metric === b.metric && triggered(r.trigger, b, threshold),
    );
  if (!hit) return null;
  const confession = confessions.get(hit.confession_id);
  const engine = await getEngine();
  const recall = engine.recall(`${b.symbol} ${b.label} ${b.domain} ${confession?.error_type ?? ""} refuse ${hit.rule_id} confession`);
  engine.reinforce(hit.memory_id);
  return { rule: hit, confession, recall };
}

export function score(claim: Claim, b: Bundle, forced: boolean): { outcome: boolean; errorType: ErrorType | null } {
  let errorType: ErrorType | null = null;
  if (b.status === "conflict") errorType = "source_conflict";
  else if (b.status === "partial") errorType = "partial_data";
  else if (claim.threshold !== null && !b.readings.every((r) => r.value !== null && r.value > (claim.threshold as number))) {
    errorType = "claim_false";
  }
  if (forced && errorType === null) errorType = "claim_false";
  return { outcome: errorType === null, errorType };
}

/** Is there already a rule that covers this exact pattern? Used to avoid writing duplicates. */
export function existingRule(b: Bundle, errorType: ErrorType): Rule | undefined {
  const status = errorType === "source_conflict" ? "conflict" : errorType === "partial_data" ? "partial" : null;
  if (!status) return undefined;
  return rules
    .all()
    .find((r) => r.shape.domain === b.domain && r.shape.symbol === b.symbol && r.trigger.kind === "source_status" && r.trigger.status === status);
}

function ruleFor(errorType: ErrorType, claim: Claim, b: Bundle, cid: string): { text: string; trigger: Trigger } {
  const subject = `${claim.symbol} ${b.label}`;
  if (errorType === "source_conflict") {
    return { text: `If sources conflict on ${subject}, refuse and cite ${cid}`, trigger: { kind: "source_status", status: "conflict" } };
  }
  if (errorType === "partial_data") {
    return { text: `If sources are partial on ${subject}, refuse and cite ${cid}`, trigger: { kind: "source_status", status: "partial" } };
  }
  const t = claim.threshold ?? b.consensus ?? 0;
  return {
    text: `If ${subject} consensus is below the claimed value and the claim is at or above ${fmtValue(DOMAINS[b.domain].unit, t)}, refuse and cite ${cid}`,
    trigger: { kind: "consensus_below_threshold", threshold: t },
  };
}

const SYSTEM =
  "You are the confessor in Alea, which reads the same fact from several independent sources and refuses to repeat its own mistakes. " +
  "Write two or three short sentences in plain English for a first-time visitor, speaking as 'we'. Say what we asked the sources, " +
  "what went wrong (they disagreed by more than the allowed gap, some did not answer, or the claim did not hold), that we did not publish a number as truth, " +
  "and that we saved a rule so next time the same situation is refused and points back to this confession. " +
  "Use only the numbers provided. No internal codes like source_conflict, no jargon, no apology, no hype, no markdown.";

export async function confess(args: {
  claim: Claim;
  bundle: Bundle;
  errorType: ErrorType;
  forced: boolean;
}): Promise<{ confession: Confession; rule: Rule }> {
  const { claim, bundle, errorType, forced } = args;
  const engine = await getEngine();
  const now = new Date();
  const cid = nextConfessionId(now);
  const rid = nextRuleId(DOMAINS[bundle.domain].rulePrefix);
  const { text: ruleText, trigger } = ruleFor(errorType, claim, bundle, cid);

  let narrative = confessionTemplate({ bundle, claim: claim.text, errorType, ruleId: rid, threshold: claim.threshold, forced });
  let narrativeAuthor: Author = "template";
  let narrativeModel = "template";
  let judge: JudgeResult | undefined;
  if (!config.sample && nightshiftConfigured()) {
    const facts = {
      claim: claim.text,
      what_went_wrong: errorType === "source_conflict" ? "sources disagreed by more than the allowed gap" : errorType === "partial_data" ? "not enough sources answered" : "the claim did not hold",
      readings: bundle.readings,
      spread: bundle.spread,
      allowed_gap: bundle.tolerance,
      consensus: bundle.consensus,
      rule_id: rid,
    };
    const user = JSON.stringify(facts);
    const out = await complete(SYSTEM, user);
    if (out) {
      const r = await review({ draft: out, facts, rewrite: (critique) => complete(SYSTEM, `${user}\n\n${critique}`) });
      judge = r.judge;
      if (r.text) {
        narrative = r.text.slice(0, 500);
        narrativeAuthor = "nightshift";
        narrativeModel = r.model;
      }
    }
  }

  const memoryId = engine.remember({
    content: `Confession ${cid} (${errorType}): ${claim.text}. ${narrative} ${ruleText} [${rid}]`,
    tags: ["confession", rid, errorType, bundle.domain, claim.symbol, bundle.metric],
    confidence: 0.85,
  });

  const confession: Confession = {
    confession_id: cid,
    claim: claim.text,
    sources: bundle.readings.map((r) => r.source),
    source_status: bundle.status,
    confidence: claim.confidence,
    outcome: "false",
    error_type: errorType,
    rule_id: rid,
    rule_text: ruleText,
    next_action: "refuse",
    created_at: now.toISOString(),
    domain: bundle.domain,
    symbol: claim.symbol,
    threshold: claim.threshold,
    narrative,
    narrative_author: narrativeAuthor,
    narrative_model: narrativeModel,
    memory_id: memoryId,
    forced: forced || bundle.forced_conflict === true,
    tolerance: bundle.tolerance,
    tolerance_kind: bundle.tolerance_kind,
    ...(judge ? { judge } : {}),
  };
  const rule: Rule = {
    rule_id: rid,
    rule_text: ruleText,
    confession_id: cid,
    memory_id: memoryId,
    shape: { domain: bundle.domain, symbol: claim.symbol, metric: claim.metric },
    trigger,
    action: "refuse",
    created_at: now.toISOString(),
  };
  confessions.add(confession);
  rules.add(rule);
  return { confession, rule };
}
