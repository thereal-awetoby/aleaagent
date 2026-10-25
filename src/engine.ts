// Meterless H-MEM wrapper. Loads the reference engine from vendor/hmem (npm run setup).
// If it is missing, a tiny local fallback keeps the app runnable and says so in the UI.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config, ROOT } from "./config.ts";
import type { MemoryHit, Recall } from "./types.ts";

export interface LedgerLine {
  action: string;
  actor: string;
  at: string;
  detail?: string;
}

export interface MemoryEngine {
  source: "vendor/hmem" | "fallback";
  remember(input: { content: string; tags: string[]; confidence: number }): string;
  recall(query: string): Recall;
  reinforce(id: string): void;
  history(id: string): LedgerLine[];
}

const VENDOR_ENTRY = path.join(ROOT, "vendor", "hmem", "src", "index.ts");

async function createHmem(dir: string): Promise<MemoryEngine | null> {
  if (!fs.existsSync(VENDOR_ENTRY)) return null;
  const mod = await import(pathToFileURL(VENDOR_ENTRY).href);
  const hmem = new mod.HMEM({ persistDir: dir, actor: "alea" });
  return {
    source: "vendor/hmem",
    remember({ content, tags, confidence }) {
      const rec = hmem.add({ content, type: "factual", layer: "long_term", tags, confidence, source: "alea:confessor" });
      return rec.id as string;
    },
    recall(query) {
      const r = hmem.query(query, { threshold: 0.1, topN: 5 });
      const hits: MemoryHit[] = r.memories.map((m: any) => ({
        id: m.memory.id,
        relevance: Number(m.relevance.toFixed(3)),
        content: m.memory.content,
      }));
      return { hits, strategy: r.trace.strategy, reason: r.trace.retrievalReason };
    },
    reinforce(id) {
      try {
        hmem.feedback(id, "helpful");
      } catch {
        /* memory may have been archived; not fatal */
      }
    },
    history(id) {
      return hmem.ledger.history(id).map((e: any) => ({
        action: e.action,
        actor: e.actor,
        at: new Date(e.timestamp).toISOString(),
        detail:
          e.newState?.confidence !== undefined
            ? `confidence ${e.previousState?.confidence ?? "-"} -> ${e.newState.confidence}`
            : e.details?.query
              ? `query: ${e.details.query}`
              : undefined,
      }));
    },
  };
}

function createFallback(dir: string): MemoryEngine {
  interface Rec { id: string; content: string; tags: string[]; confidence: number }
  const file = path.join(dir, "fallback.json");
  fs.mkdirSync(dir, { recursive: true });
  const recs: Rec[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : [];
  const log: Record<string, LedgerLine[]> = {};
  const save = () => fs.writeFileSync(file, JSON.stringify(recs, null, 2), "utf-8");
  const tok = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9_.+-]+/g) ?? []);
  const note = (id: string, action: string, detail?: string) =>
    (log[id] ??= []).push({ action, actor: "alea", at: new Date().toISOString(), detail });
  return {
    source: "fallback",
    remember({ content, tags, confidence }) {
      const id = `mem-${recs.length + 1}`;
      recs.push({ id, content, tags, confidence });
      note(id, "create");
      save();
      return id;
    },
    recall(query) {
      const q = tok(query);
      const hits = recs
        .map((r) => {
          const t = tok(r.content);
          const overlap = [...q].filter((w) => t.has(w)).length;
          return { id: r.id, content: r.content, relevance: Number((overlap / Math.max(q.size, 1) * r.confidence).toFixed(3)) };
        })
        .filter((h) => h.relevance > 0.1)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
      return { hits, strategy: "keyword-overlap", reason: "fallback engine (vendor/hmem not installed)" };
    },
    reinforce(id) {
      const r = recs.find((x) => x.id === id);
      if (!r) return;
      const prev = r.confidence;
      r.confidence = Math.min(1, Number((r.confidence + 0.05).toFixed(2)));
      note(id, "feedback", `confidence ${prev} -> ${r.confidence}`);
      save();
    },
    history: (id) => log[id] ?? [],
  };
}

let current: MemoryEngine | null = null;

export async function getEngine(): Promise<MemoryEngine> {
  if (current) return current;
  const dir = path.join(config.dataDir, "hmem");
  current = (await createHmem(dir)) ?? createFallback(dir);
  return current;
}

// Not memory, so Clear memory keeps them: the user's saved settings and the Zetaris export file.
const KEEP_ON_RESET = ["constraints.json", "readings.csv"];

export async function resetEngine(): Promise<MemoryEngine> {
  current = null;
  const kept = KEEP_ON_RESET.map((name) => path.join(config.dataDir, name))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, data: fs.readFileSync(file) }));
  fs.rmSync(config.dataDir, { recursive: true, force: true });
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const { file, data } of kept) fs.writeFileSync(file, data);
  return getEngine();
}
