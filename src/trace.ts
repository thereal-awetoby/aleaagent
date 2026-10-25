import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import type { TraceEvent } from "./types.ts";

const file = () => path.join(config.logDir, "trace.jsonl");

export function trace(cycleId: string, from: string, to: string, type: string, summary: string, model = "none"): TraceEvent {
  const event: TraceEvent = { ts: new Date().toISOString(), cycle_id: cycleId, from, to, type, summary, model };
  fs.mkdirSync(config.logDir, { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(event) + "\n", "utf-8");
  return event;
}

export function recentTrace(limit = 40): TraceEvent[] {
  if (!fs.existsSync(file())) return [];
  const lines = fs.readFileSync(file(), "utf-8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l) as TraceEvent);
}

export function clearTrace(): void {
  fs.rmSync(file(), { force: true });
}
