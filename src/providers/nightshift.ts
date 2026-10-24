// Nightshift via its OpenAI-compatible chat completions endpoint.
// The model only writes prose. Numbers always come from the sources.

import { config } from "../config.ts";

export const nightshiftConfigured = (): boolean => config.nightshift.baseUrl !== "";

export async function complete(system: string, user: string): Promise<string | null> {
  const { baseUrl, apiKey, model } = config.nightshift;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
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
    const out = String(j.choices?.[0]?.message?.content ?? "").trim();
    return out || null;
  } catch (err) {
    console.warn(`[nightshift] falling back to template: ${(err as Error).message}`);
    return null;
  }
}
