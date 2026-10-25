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

export interface Completion {
  text: string;
  /** Model that actually answered, as reported by the Runtime (falls back to the requested route). */
  model: string;
  attempts: number;
}

async function once(system: string, user: string): Promise<Completion> {
  const { baseUrl, model } = config.nightshift;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: headers(),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j: any = await res.json();
  const text = String(j.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("empty reply");
  return { text, model: String(j.model ?? model), attempts: 1 };
}

/** One call with one retry. Returns null (caller uses the template) if both attempts fail. */
export async function complete(system: string, user: string): Promise<Completion | null> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await once(system, user);
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
