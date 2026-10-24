export type Asset = "BTC" | "ETH";
export type Metric = "change_24h";
export type Scenario = "aligned" | "conflict";
export type SourceStatus = "aligned" | "conflict" | "partial";
export type ErrorType = "source_conflict" | "partial_data" | "claim_false";
export type Author = "nightshift" | "template";

export interface Reading {
  source: string;
  value: number | null;
  error?: string;
}

export interface Bundle {
  symbol: Asset;
  metric: Metric;
  readings: Reading[];
  status: SourceStatus;
  spread: number | null;
  consensus: number | null;
  tolerance: number;
  via: "fixture" | "zetaris" | "direct";
  query?: string;
}

export interface Claim {
  claim_id: string;
  text: string;
  symbol: Asset;
  metric: Metric;
  threshold: number;
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
  shape: { symbol: Asset; metric: Metric };
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
  symbol: Asset;
  threshold: number;
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
  symbol: Asset;
  threshold: number;
  scenario: Scenario;
  proposed: string;
  mode: ModeInfo;
  bundle: Bundle;
  decision: "refuse" | "stands" | "confess";
  claim?: Claim;
  refusal?: { rule: Rule; confession?: Confession; recall: Recall };
  confession?: Confession;
  rule?: Rule;
  trace: TraceEvent[];
}
