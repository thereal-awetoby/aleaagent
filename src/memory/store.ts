// Append-only stores for confessions and rules (JSONL). The H-MEM engine holds the
// recallable memory; these files are the authoritative, human-readable record.

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import type { Confession, Rule } from "../types.ts";

const confessionsFile = () => path.join(config.dataDir, "confessions.jsonl");
const rulesFile = () => path.join(config.dataDir, "rules.jsonl");

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

function append(file: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + "\n", "utf-8");
}

export const confessions = {
  all: (): Confession[] => readJsonl<Confession>(confessionsFile()),
  get: (id: string): Confession | undefined => confessions.all().find((c) => c.confession_id === id),
  add: (c: Confession): void => append(confessionsFile(), c),
};

export const rules = {
  all: (): Rule[] => readJsonl<Rule>(rulesFile()),
  add: (r: Rule): void => append(rulesFile(), r),
};

export function nextConfessionId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const n = confessions.all().filter((c) => c.confession_id.startsWith(`c_${day}_`)).length + 1;
  return `c_${day}_${String(n).padStart(3, "0")}`;
}

export function nextRuleId(): string {
  return `R-${String(rules.all().length + 1).padStart(3, "0")}`;
}
