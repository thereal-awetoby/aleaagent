import type { JudgeResult } from "./agents/judge.ts";
import type { DomainId } from "./domains.ts";

export type { DomainId };
/** Symbol within a domain (BTC, AAPL, EURUSD, eth-gas, Lagos...). */
export type Asset = string;
export type Metric = string;
export type Scenario = "aligned" | "conflict";
export type SourceStatus = "aligned" | "conflict" | "partial";
export type ErrorType = "source_conflict" | "partial_data" | "claim_false";
export type Author = "nightshift" | "template";

export interface Reading {
  source: string;
  value: number | null;
  error?: string;
  /** Set when Force conflict skewed this live reading on purpose. */
  forced?: boolean;
}

export interface Bundle {
  domain: DomainId;
  symbol: Asset;
  metric: Metric;
  label: string;
  /** Time window id when the domain supports windows (e.g. "1d", "7d", "now"). */
  window?: string;
  readings: Reading[];
  status: SourceStatus;
  spread: number | null;
  consensus: number | null;
  /** Tolerance this bundle was classified with (abs = metric units, rel = share of the midpoint). */
  tolerance: number;
  tolerance_kind: "abs" | "rel";
  /** The domain default, and where `tolerance` came from: the default, the user's saved value, or this run. */
  tolerance_default: number;
  tolerance_source: "default" | "saved" | "run";
  via: "fixture" | "zetaris" | "direct";
  query?: string;
  /** True when a live reading was skewed because Force conflict was on. */
  forced_conflict?: boolean;
  /** Sources (or "zetaris") that failed once and were tried again. */
  retries?: string[];
  /** Set when Zetaris could not be reached and the direct sources were used instead. */
  fallback?: string;
}

export interface Claim {
  claim_id: string;
  text: string;
  domain: DomainId;
  symbol: Asset;
  metric: Metric;
  /** null = point claim ("is about X"); a number = "is above X". */
  threshold: number | null;
  confidence: number;
  rationale: string;
  author: Author;
  /** Model that wrote the rationale ("template" when no model was used). */
  model: string;
  /** Judge review of a model-written rationale (absent when the template was used). */
  judge?: JudgeResult;
}

export type Trigger =
  | { kind: "source_status"; status: SourceStatus }
  | { kind: "consensus_below_threshold"; threshold: number };

export interface Rule {
  rule_id: string;
  rule_text: string;
  confession_id: string;
  memory_id: string;
  shape: { domain: DomainId; symbol: Asset; metric: Metric };
  trigger: Trigger;
  action: "refuse";
  created_at: string;
}

export interface Confession {
  confession_id: string;
  claim: string;
  sources: string[];
  source_status: SourceStatus;
  confidence: number;
  outcome: "false";
  error_type: ErrorType;
  rule_id: string;
  rule_text: string;
  next_action: "refuse";
  created_at: string;
  // extensions beyond the stable schema
  domain: DomainId;
  symbol: Asset;
  threshold: number | null;
  narrative: string;
  narrative_author: Author;
  narrative_model?: string;
  memory_id: string;
  forced: boolean;
  /** Tolerance in force when the confession was written (absent on older records). */
  tolerance?: number;
  tolerance_kind?: "abs" | "rel";
  /** Judge review of a model-written narrative (absent when the template was used). */
  judge?: JudgeResult;
}

export interface MemoryHit {
  id: string;
  relevance: number;
  content: string;
}

export interface Recall {
  hits: MemoryHit[];
  strategy: string;
  reason: string;
}

export interface TraceEvent {
  ts: string;
  cycle_id: string;
  from: string;
  to: string;
  type: string;
  summary: string;
  /** Which model handled this step: a Nightshift model id, "template", or "none" for non-LLM steps. */
  model?: string;
}

export interface ModeInfo {
  sample: boolean;
  data: "fixture" | "zetaris" | "direct";
  llm: "template" | "nightshift";
  memory: string;
}

export interface CycleResult {
  cycle_id: string;
  at: string;
  domain: DomainId;
  symbol: Asset;
  /** Time window used for this run (when domain has windows). */
  window?: string;
  threshold: number | null;
  scenario: Scenario;
  proposed: string;
  mode: ModeInfo;
  bundle: Bundle;
  /** withheld = conflict or partial data, no claim made, waiting for POST /api/confess. */
  decision: "refuse" | "stands" | "confess" | "withheld";
  claim?: Claim;
  error_type?: ErrorType;
  refusal?: { rule: Rule; confession?: Confession; recall: Recall };
  confession?: Confession;
  rule?: Rule;
  trace: TraceEvent[];
}
