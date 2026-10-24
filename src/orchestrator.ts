// One full cycle: aggregate -> rule check -> claim -> score -> confess or refuse.

import { aggregate } from "./agents/aggregator.ts";
import { claimText, makeClaim } from "./agents/claim.ts";
import { checkRules, confess, score } from "./agents/confessor.ts";
import { config } from "./config.ts";
import { getEngine } from "./engine.ts";
import { nightshiftConfigured } from "./providers/nightshift.ts";
import { zetarisConfigured } from "./providers/zetaris.ts";
import { trace } from "./trace.ts";
import type { Asset, CycleResult, ModeInfo, Scenario, TraceEvent } from "./types.ts";

export interface RunOptions {
  symbol: Asset;
  threshold: number;
  scenario: Scenario;
  forceOutcome?: boolean;
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
  const { symbol, threshold, scenario } = opts;
  const forced = opts.forceOutcome === true;
  const cycleId = Date.now().toString(36);
  const events: TraceEvent[] = [];
  const log = (from: string, to: string, type: string, summary: string) => events.push(trace(cycleId, from, to, type, summary));
  const mode = await currentMode();
  const proposed = claimText(symbol, threshold);
  const base = { cycle_id: cycleId, at: new Date().toISOString(), symbol, threshold, scenario, proposed, mode };

  log("orchestrator", "aggregator", "request", `${symbol} 24h change via ${mode.data}`);
  const bundle = await aggregate(symbol, scenario);
  const readings = bundle.readings.map((r) => `${r.source}=${r.value ?? "n/a"}`).join(" ");
  log("aggregator", "orchestrator", "bundle", `status=${bundle.status} spread=${bundle.spread ?? "n/a"} ${readings}`);

  log("orchestrator", "confessor", "rule_check", `active rules for ${symbol}`);
  const match = await checkRules(bundle, threshold);
  if (match) {
    log("confessor", "meterless", "recall", `${match.recall.hits.length} memories recalled, reinforced ${match.rule.memory_id}`);
    log("confessor", "orchestrator", "refuse", `${match.rule.rule_id} matched, citing ${match.rule.confession_id}`);
    return { ...base, bundle, decision: "refuse", refusal: match, trace: events };
  }

  const claim = await makeClaim(bundle, threshold, cycleId);
  log("claim", "confessor", "claim", `${claim.text} (confidence ${claim.confidence}, ${claim.author})`);

  const { outcome, errorType } = score(claim, bundle, forced);
  if (outcome || errorType === null) {
    log("confessor", "orchestrator", "stands", "claim holds across all sources");
    return { ...base, bundle, decision: "stands", claim, trace: events };
  }

  log("confessor", "orchestrator", "outcome", `false, error_type=${errorType}${forced ? " (forced)" : ""}`);
  const { confession, rule } = await confess({ claim, bundle, errorType, forced });
  log("confessor", "meterless", "remember", `${confession.confession_id} stored as ${confession.memory_id}`);
  log("confessor", "orchestrator", "rule", `${rule.rule_id} emitted: ${rule.rule_text}`);
  return { ...base, bundle, decision: "confess", claim, confession, rule, trace: events };
}
