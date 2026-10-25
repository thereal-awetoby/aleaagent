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
  readings: Reading[];
  status: SourceStatus;
  spread: number | null;
  consensus: number | null;
  tolerance: number;
  tolerance_kind: "abs" | "rel";
  via: "fixture" | "zetaris" | "direct";
  query?: string;
  /** True when a live reading was skewed because Force conflict was on. */
  forced_conflict?: boolean;
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
  memory_id: string;
  forced: boolean;
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
