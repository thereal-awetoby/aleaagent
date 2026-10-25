// One full cycle: aggregate -> rule check -> claim -> score -> confess, withhold or refuse.
//
// autoConfess = true  (default, classic UI and legacy routes): a failed claim is confessed at once.
// autoConfess = false (main UI): a failed claim is withheld ("No claim made") and kept pending
// until POST /api/confess writes the confession for that cycle.

import { aggregate } from "./agents/aggregator.ts";
import { claimText, makeClaim } from "./agents/claim.ts";
import { checkRules, confess, existingRule, score } from "./agents/confessor.ts";
import { config } from "./config.ts";
import type { DomainId } from "./domains.ts";
import { getEngine } from "./engine.ts";
import { refusals } from "./memory/store.ts";
import { nightshiftConfigured } from "./providers/nightshift.ts";
import { zetarisConfigured } from "./providers/zetaris.ts";
import { trace } from "./trace.ts";
import type { Bundle, Claim, Confession, CycleResult, ErrorType, ModeInfo, Rule, Scenario, TraceEvent } from "./types.ts";

export interface RunOptions {
  domain?: DomainId;
  symbol: string;
  threshold?: number | null;
  scenario: Scenario;
  /** One-off tolerance for this run, in the domain's own units. Overrides the saved tolerance. */
  tolerance?: number | null;
  forceOutcome?: boolean;
  autoConfess?: boolean;
}

interface Pending {
  claim: Claim;
  bundle: Bundle;
  errorType: ErrorType;
  forced: boolean;
}

const pending = new Map<string, Pending>();

export function clearPending(): void {
  pending.clear();
}

export async function currentMode(): Promise<ModeInfo> {
  const engine = await getEngine();
  return {
    sample: config.sample,
    data: config.sample ? "fixture" : zetarisConfigured() ? "zetaris" : "direct",
    llm: !config.sample && nightshiftConfigured() ? "nightshift" : "template",
    memory: engine.source,
  };
}

export async function runCycle(opts: RunOptions): Promise<CycleResult> {
  const domain: DomainId = opts.domain ?? "crypto";
  const { symbol, scenario } = opts;
  const threshold = opts.threshold ?? null;
  const forced = opts.forceOutcome === true;
  const autoConfess = opts.autoConfess !== false;
  const cycleId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const events: TraceEvent[] = [];
  const log = (from: string, to: string, type: string, summary: string, model?: string) =>
    events.push(trace(cycleId, from, to, type, summary, model));
  const mode = await currentMode();
  const base = { cycle_id: cycleId, at: new Date().toISOString(), domain, symbol, threshold, scenario, mode };

  const bundle = await aggregate(domain, symbol, scenario, opts.tolerance);
  const proposed = claimText(domain, symbol, threshold, bundle.consensus);
  log("orchestrator", "aggregator", "request", `${domain}/${symbol} ${bundle.label} via ${mode.data}`);
  if (bundle.tolerance_source !== "default") {
    log("orchestrator", "aggregator", "tolerance", `${bundle.tolerance_source === "run" ? "this run" : "saved"} tolerance ${bundle.tolerance} (default ${bundle.tolerance_default})`);
  }
  const readings = bundle.readings
    .map((r) => `${r.source}=${r.value ?? (r.error ? `n/a(${r.error})` : "n/a")}${r.forced ? "(forced)" : ""}`)
    .join(" ");
  if (bundle.query) log("aggregator", "zetaris", "sql", bundle.query);
  for (const r of bundle.retries ?? []) log("aggregator", r, "retry", `${r} failed once, tried again`);
  if (bundle.fallback) log("aggregator", "orchestrator", "fallback", bundle.fallback);
  log("aggregator", "orchestrator", "bundle", `status=${bundle.status} spread=${bundle.spread ?? "n/a"} ${readings}`);

  log("orchestrator", "confessor", "rule_check", `active rules for ${domain}/${symbol}`);
  const match = await checkRules(bundle, threshold);
  if (match) {
    refusals.add({ at: base.at, cycle_id: cycleId, rule_id: match.rule.rule_id, confession_id: match.rule.confession_id, domain, symbol });
    log("confessor", "meterless", "recall", `${match.recall.hits.length} memories recalled, reinforced ${match.rule.memory_id}`);
    log("confessor", "orchestrator", "refuse", `${match.rule.rule_id} matched, citing ${match.rule.confession_id}`);
    return { ...base, proposed, bundle, decision: "refuse", refusal: match, trace: events };
  }

  const claim = await makeClaim(bundle, threshold, cycleId);
  const { outcome, errorType } = score(claim, bundle, forced);
  if (outcome || errorType === null) {
    log("claim", "confessor", "claim", `${claim.text} (confidence ${claim.confidence})`, claim.model);
    log("confessor", "orchestrator", "stands", "claim holds across all sources");
    return { ...base, proposed, bundle, decision: "stands", claim, trace: events };
  }

  if (!autoConfess) {
    pending.set(cycleId, { claim, bundle, errorType, forced });
    while (pending.size > 50) pending.delete(pending.keys().next().value as string);
    log("claim", "orchestrator", "withheld", `no claim made, ${errorType}; waiting for a confession`, claim.model);
    return { ...base, proposed, bundle, decision: "withheld", claim, error_type: errorType, trace: events };
  }

  log("claim", "confessor", "claim", `${claim.text} (confidence ${claim.confidence})`, claim.model);
  log("confessor", "orchestrator", "outcome", `false, error_type=${errorType}${forced ? " (forced)" : ""}`);
  const { confession, rule } = await confess({ claim, bundle, errorType, forced });
  log("confessor", "meterless", "remember", `${confession.confession_id} stored as ${confession.memory_id}`, confession.narrative_model);
  log("confessor", "orchestrator", "rule", `${rule.rule_id} emitted: ${rule.rule_text}`);
  return { ...base, proposed, bundle, decision: "confess", claim, error_type: errorType, confession, rule, trace: events };
}

/** The manual "Write confession" step for a withheld cycle. */
export async function confessPending(cycleId: string): Promise<{ confession: Confession; rule: Rule; trace: TraceEvent[] }> {
  const p = pending.get(cycleId);
  if (!p) throw new Error("nothing to confess for that run; run again");
  if (existingRule(p.bundle, p.errorType)) {
    pending.delete(cycleId);
    throw new Error("a rule for this pattern already exists");
  }
  const events: TraceEvent[] = [];
  const log = (from: string, to: string, type: string, summary: string, model?: string) =>
    events.push(trace(cycleId, from, to, type, summary, model));
  log("orchestrator", "confessor", "confess", `writing confession for ${p.bundle.domain}/${p.bundle.symbol}`);
  const { confession, rule } = await confess(p);
  pending.delete(cycleId);
  log("confessor", "meterless", "remember", `${confession.confession_id} stored as ${confession.memory_id}`, confession.narrative_model);
  log("confessor", "orchestrator", "rule", `${rule.rule_id} emitted: ${rule.rule_text}`);
  return { confession, rule, trace: events };
}
