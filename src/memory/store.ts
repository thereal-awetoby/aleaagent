// Append-only stores for confessions, rules and refusals (JSONL). The H-MEM engine holds the
// recallable memory; these files are the authoritative, human-readable record.

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import type { DomainId } from "../domains.ts";
import type { Confession, Rule } from "../types.ts";

const confessionsFile = () => path.join(config.dataDir, "confessions.jsonl");
const rulesFile = () => path.join(config.dataDir, "rules.jsonl");
const refusalsFile = () => path.join(config.dataDir, "refusals.jsonl");

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

function append(file: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + "\n", "utf-8");
}

// Records written before domains existed were all crypto.
const withDomain = <T extends { domain?: DomainId }>(x: T): T => (x.domain ? x : { ...x, domain: "crypto" as DomainId });

export const confessions = {
  all: (): Confession[] => readJsonl<Confession>(confessionsFile()).map(withDomain),
  get: (id: string): Confession | undefined => confessions.all().find((c) => c.confession_id === id),
  add: (c: Confession): void => append(confessionsFile(), c),
};

export const rules = {
  all: (): Rule[] =>
    readJsonl<Rule>(rulesFile()).map((r) => (r.shape.domain ? r : { ...r, shape: { ...r.shape, domain: "crypto" as DomainId } })),
  add: (r: Rule): void => append(rulesFile(), r),
};

export interface Refusal {
  at: string;
  cycle_id: string;
  rule_id: string;
  confession_id: string;
  domain: DomainId;
  symbol: string;
}

export const refusals = {
  all: (): Refusal[] => readJsonl<Refusal>(refusalsFile()),
  add: (r: Refusal): void => append(refusalsFile(), r),
  /** confession_id -> number of times it has been cited in a refusal */
  counts: (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of refusals.all()) out[r.confession_id] = (out[r.confession_id] ?? 0) + 1;
    return out;
  },
};

export function nextConfessionId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const n = confessions.all().filter((c) => c.confession_id.startsWith(`c_${day}_`)).length + 1;
  return `c_${day}_${String(n).padStart(3, "0")}`;
}

/** Rule ids are numbered per domain prefix: R-CRYPTO-001, R-WX-001, ... */
export function nextRuleId(prefix: string): string {
  const n = rules.all().filter((r) => r.rule_id.startsWith(`${prefix}-`)).length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
