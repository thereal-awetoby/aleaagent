// Meterless Nightshift Runtime: the OpenAI-compatible API served by the Nightshift AI hotspot.
// Contract from the Participant Setup Guide (4.5): Bearer token, meterless-app and
// meterless-scope headers, GET /v1/models for discovery, POST /v1/chat/completions.
// The model only writes prose. Numbers always come from the sources.

import { config } from "../config.ts";

export const nightshiftConfigured = (): boolean => config.nightshift.baseUrl !== "" && config.nightshift.apiKey !== "";

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${config.nightshift.apiKey}`,
    "meterless-app": config.nightshift.app,
    "meterless-scope": "user",
  };
}

/** Appended to every system prompt: reasoning models may think, but the final text goes in tags. */
const ANSWER_RULE =
  "You may think first, but put only the final text between <answer> and </answer>. Nothing after </answer>.";

/**
 * Reasoning models (Nemotron) may put their thinking in the reply, with or without <think> tags.
 * Keep only the final answer: drop <think> blocks, then take the last <answer>...</answer>.
 * A reply that opened <answer> but never closed it was cut off, so it counts as no answer (the caller retries).
 * Replies without <answer> tags are returned as they are (the judge still checks them).
 */
export function finalAnswer(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (/<think>/i.test(t)) t = t.slice(0, t.search(/<think>/i));
  const tagged = [...t.matchAll(/<answer>([\s\S]*?)<\/answer>/gi)];
  if (tagged.length) return tagged[tagged.length - 1][1].trim();
  if (/<answer>/i.test(t)) return "";
  return t.trim();
}

export interface Completion {
  text: string;
  /** Model that actually answered, as reported by the Runtime (falls back to the requested route). */
  model: string;
  attempts: number;
}

async function once(system: string, user: string, routeModel?: string): Promise<Completion> {
  const { baseUrl } = config.nightshift;
  const model = routeModel || config.nightshift.model;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(config.nightshift.timeoutMs),
    headers: headers(),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: `/no_think\n${system}\n${ANSWER_RULE}` },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${snippet} (prompt ${system.length + user.length} chars)`);
  }
  const j: any = await res.json();
  const text = finalAnswer(String(j.choices?.[0]?.message?.content ?? ""));
  if (!text) throw new Error("empty reply");
  return { text, model: String(j.model ?? model), attempts: 1 };
}

/** One call with one retry. Returns null (caller uses the template) if both attempts fail. */
export async function complete(system: string, user: string, model?: string): Promise<Completion | null> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await once(system, user, model);
      return { ...out, attempts: attempt };
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === 1) console.warn(`[nightshift] attempt 1 failed (${lastError}), retrying once`);
    }
  }
  console.warn(`[nightshift] falling back to template: ${lastError}`);
  return null;
}

/** GET /v1/models: the routes Nightshift exposes. Used by `npm run check`. */
export async function listModels(): Promise<string[]> {
  const res = await fetch(`${config.nightshift.baseUrl}/models`, { signal: AbortSignal.timeout(15000), headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j: any = await res.json();
  return (j.data ?? []).map((m: any) => String(m.id));
}
