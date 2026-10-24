// Confessor Agent. Checks active rules before a claim is made, scores the claim after,
// and on failure writes a structured confession, emits a rule and stores both in H-MEM.

import { config } from "../config.ts";
import { getEngine } from "../engine.ts";
import { confessions, nextConfessionId, nextRuleId, rules } from "../memory/store.ts";
import { complete, nightshiftConfigured } from "../providers/nightshift.ts";
import { confessionTemplate } from "../sample/templates.ts";
import type { Author, Bundle, Claim, Confession, ErrorType, Recall, Rule, Trigger } from "../types.ts";

export interface RuleMatch {
  rule: Rule;
  confession?: Confession;
  recall: Recall;
}

function triggered(t: Trigger, b: Bundle, threshold: number): boolean {
  if (t.kind === "source_status") return b.status === t.status;
  return b.consensus !== null && threshold >= t.threshold && b.consensus < threshold;
}

export async function checkRules(b: Bundle, threshold: number): Promise<RuleMatch | null> {
  const hit = rules
    .all()
    .find((r) => r.shape.symbol === b.symbol && r.shape.metric === b.metric && triggered(r.trigger, b, threshold));
  if (!hit) return null;
  const confession = confessions.get(hit.confession_id);
  const engine = await getEngine();
  const recall = engine.recall(`${b.symbol} 24h change ${confession?.error_type ?? ""} refuse ${hit.rule_id} confession`);
  engine.reinforce(hit.memory_id);
  return { rule: hit, confession, recall };
}

export function score(claim: Claim, b: Bundle, forced: boolean): { outcome: boolean; errorType: ErrorType | null } {
  let errorType: ErrorType | null = null;
  if (b.status === "conflict") errorType = "source_conflict";
  else if (b.status === "partial") errorType = "partial_data";
  else if (!b.readings.every((r) => r.value !== null && r.value > claim.threshold)) errorType = "claim_false";
  if (forced && errorType === null) errorType = "claim_false";
  return { outcome: errorType === null, errorType };
}

function ruleFor(errorType: ErrorType, claim: Claim, cid: string): { text: string; trigger: Trigger } {
  const s = claim.symbol;
  if (errorType === "source_conflict") {
    return { text: `If source_status=conflict on ${s} 24h change, refuse claim and cite ${cid}`, trigger: { kind: "source_status", status: "conflict" } };
  }
  if (errorType === "partial_data") {
    return { text: `If source_status=partial on ${s} 24h change, refuse claim and cite ${cid}`, trigger: { kind: "source_status", status: "partial" } };
  }
  return {
    text: `If ${s} 24h consensus is below the claimed threshold and the threshold is at or above ${claim.threshold}%, refuse claim and cite ${cid}`,
    trigger: { kind: "consensus_below_threshold", threshold: claim.threshold },
  };
}

const SYSTEM =
  "You are the confessor in a cross-checking system. Write two or three plain first-person sentences admitting the specific error. " +
  "Use only the numbers provided. No apology, no hype, no markdown.";

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
  const rid = nextRuleId();
  const { text: ruleText, trigger } = ruleFor(errorType, claim, cid);

  let narrative = confessionTemplate({ bundle, claim: claim.text, errorType, ruleId: rid, threshold: claim.threshold, forced });
  let narrativeAuthor: Author = "template";
  if (!config.sample && nightshiftConfigured()) {
    const out = await complete(
      SYSTEM,
      JSON.stringify({ claim: claim.text, error_type: errorType, readings: bundle.readings, spread: bundle.spread, consensus: bundle.consensus, rule_id: rid }),
    );
    if (out) {
      narrative = out.slice(0, 500);
      narrativeAuthor = "nightshift";
    }
  }

  const memoryId = engine.remember({
    content: `Confession ${cid} (${errorType}): ${claim.text}. ${narrative} ${ruleText} [${rid}]`,
    tags: ["confession", rid, errorType, claim.symbol, "24h-change"],
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
    symbol: claim.symbol,
    threshold: claim.threshold,
    narrative,
    narrative_author: narrativeAuthor,
    memory_id: memoryId,
    forced,
  };
  const rule: Rule = {
    rule_id: rid,
    rule_text: ruleText,
    confession_id: cid,
    memory_id: memoryId,
    shape: { symbol: claim.symbol, metric: claim.metric },
    trigger,
    action: "refuse",
    created_at: now.toISOString(),
  };
  confessions.add(confession);
  rules.add(rule);
  return { confession, rule };
}
