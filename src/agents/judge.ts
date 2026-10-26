// Judge Agent. Reviews every sentence a model writes before anyone sees it.
//
// 1. Number check (code): every number in the draft must appear in the facts the writer was given.
// 2. Model check (Nemotron via Nightshift): is it accurate, plain English for a first-time visitor,
//    and free of invented causes or advice?
// 3. If either check finds a problem, the writer gets the critique and one chance to rewrite.
// 4. If the rewrite still fails, the caller falls back to the template. Nothing unchecked is shown.

import { config } from "../config.ts";
import { complete, nightshiftConfigured, type Completion } from "../providers/nightshift.ts";

export type JudgeVerdict = "pass" | "revised" | "rejected";

export interface JudgeResult {
  verdict: JudgeVerdict;
  /** Problems found in the first draft (empty when it passed straight away). */
  issues: string[];
  /** Model that judged ("rules" when only the number check ran). */
  judge_model: string;
  revisions: number;
}

export type Ask = (system: string, user: string, model?: string) => Promise<Completion | null>;

const JUDGE_SYSTEM =
  "You are the judge in Alea, a cross-checking system. You review a short text another model wrote about source data, for a first-time visitor. " +
  "Check: (1) every number appears in the facts; (2) it says in normal words what was checked (e.g. 'the temperature in Singapore'), " +
  "what the sources reported, including any that did not answer, and the allowed gap in plain units; (3) it states correctly whether the sources " +
  "agreed, disagreed or were incomplete, and why no single number was published when they did not agree; (4) for a confession, it says that next time " +
  "the same pattern appears Alea will refuse and point back to this confession, with any rule id only after the plain sentences; " +
  "(5) no internal codes like source_conflict or error_type, no jargon, no advice, no invented causes. " +
  'Reply with JSON only: {"verdict":"pass"} or {"verdict":"revise","issues":["short problem", "..."]}.';

const IDS = /\b(?:c_\d{8}_\d+|R-[A-Z]+-\d+|cl_[a-z0-9]+|mem_[a-z0-9_]+)\b/gi;
const DATES = /\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?\b/g;

function factNumbers(facts: unknown, out: number[] = []): number[] {
  if (typeof facts === "number" && Number.isFinite(facts)) out.push(facts, Math.abs(facts));
  else if (typeof facts === "string") {
    for (const m of facts.replace(IDS, " ").replace(DATES, " ").match(/-?\d+(?:\.\d+)?/g) ?? []) out.push(Math.abs(Number(m)));
  } else if (Array.isArray(facts)) facts.forEach((f) => factNumbers(f, out));
  else if (facts && typeof facts === "object") Object.values(facts).forEach((f) => factNumbers(f, out));
  return out;
}

/** Numbers in the draft that do not appear in the facts (small counts like "three" or "2 sources" are allowed). */
export function numberCheck(draft: string, facts: unknown): string[] {
  const allowed = factNumbers(facts);
  const found = draft.replace(IDS, " ").replace(DATES, " ").replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/g) ?? [];
  const bad: string[] = [];
  for (const raw of found) {
    const n = Math.abs(Number(raw));
    if (Number.isInteger(n) && n <= 10) continue;
    const decimals = (raw.split(".")[1] ?? "").length;
    const tol = decimals === 0 ? 0.5 : 0.5 * 10 ** -decimals + 1e-9;
    if (!allowed.some((a) => Math.abs(a - n) <= tol)) bad.push(raw);
  }
  return [...new Set(bad)].map((n) => `the number ${n} is not in the source data`);
}

const META = /\b(the user|i need to|i should|i will|let me|as (?:a|the) (?:claim|confessor) agent|my (?:task|instructions)|the instructions|write (?:1|one|two|2)[^.]*sentences?|first-time visitor)\b|<\/?think>/i;

/** Text that talks about the task instead of doing it (leaked model reasoning). */
export function metaCheck(draft: string): string[] {
  return META.test(draft) ? ["the text describes the task or the model's own reasoning instead of answering"] : [];
}

function parseVerdict(text: string): { verdict: "pass" | "revise"; issues: string[] } | null {
  const all = text.match(/\{[^{}]*"verdict"[^{}]*\}/g);
  if (!all) return null;
  try {
    const j = JSON.parse(all[all.length - 1]);
    const verdict = j.verdict === "pass" ? "pass" : j.verdict === "revise" ? "revise" : null;
    if (!verdict) return null;
    const issues = Array.isArray(j.issues) ? j.issues.map((s: unknown) => String(s).slice(0, 160)).slice(0, 5) : [];
    return { verdict, issues };
  } catch {
    return null;
  }
}

async function judgeOnce(draft: string, facts: unknown, ask: Ask, live: boolean, checks?: (text: string) => string[]): Promise<{ issues: string[]; model: string }> {
  const issues = [...metaCheck(draft), ...numberCheck(draft, facts), ...(checks ? checks(draft) : [])];
  // Code checks are free; a model review is not. If the draft already fails in code, skip the model call.
  if (!live || issues.length) return { issues, model: "rules" };
  const out = await ask(JUDGE_SYSTEM, JSON.stringify({ facts, text: draft }), config.nightshift.judgeModel);
  if (!out) return { issues, model: "rules" };
  const v = parseVerdict(out.text);
  if (!v) issues.push("the judge did not return a clear verdict");
  else if (v.verdict === "revise") issues.push(...(v.issues.length ? v.issues : ["the judge asked for a rewrite"]));
  return { issues, model: out.model };
}

/**
 * Review a model-written draft. `rewrite` is called with the judge's critique when the draft fails.
 * Returns the text to show (null = use the template) and the judge's record.
 */
export async function review(args: {
  draft: Completion;
  facts: unknown;
  rewrite: (critique: string) => Promise<Completion | null>;
  ask?: Ask;
  /** Extra rules checked in code for this kind of text (e.g. a confession must promise to refuse next time). */
  checks?: (text: string) => string[];
}): Promise<{ text: string | null; model: string; judge: JudgeResult }> {
  const ask = args.ask ?? complete;
  const live = args.ask !== undefined || (!config.sample && nightshiftConfigured());
  const first = await judgeOnce(args.draft.text, args.facts, ask, live, args.checks);
  if (first.issues.length === 0) {
    return { text: args.draft.text, model: args.draft.model, judge: { verdict: "pass", issues: [], judge_model: first.model, revisions: 0 } };
  }
  const second = await args.rewrite(`A reviewer found these problems: ${first.issues.join("; ")}. Rewrite the text to fix them.`);
  if (second) {
    const again = await judgeOnce(second.text, args.facts, ask, live, args.checks);
    if (again.issues.length === 0) {
      return { text: second.text, model: second.model, judge: { verdict: "revised", issues: first.issues, judge_model: again.model, revisions: 1 } };
    }
  }
  return { text: null, model: "template", judge: { verdict: "rejected", issues: first.issues, judge_model: first.model, revisions: 1 } };
}

/** One line for logs and the Activity panel. */
export function judgeSummary(j: JudgeResult): string {
  if (j.verdict === "pass") return "judge: checked against the data, passed";
  if (j.verdict === "revised") return `judge: sent back once (${j.issues[0]}), rewrite passed`;
  return `judge: rejected twice (${j.issues[0]}), template used`;
}
