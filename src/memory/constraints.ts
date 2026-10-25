// User-defined constraints. Today that is the conflict tolerance per domain. Stored as one small
// JSON file next to the memory files. These are settings, not memory, so "Clear memory" keeps them.

import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { DOMAINS, isDomain, tolLabel, tolLimits, type DomainId } from "../domains.ts";

export type SavedTolerances = Partial<Record<DomainId, number>>;

const file = () => path.join(config.dataDir, "constraints.json");

/**
 * Check a tolerance for a domain and return it. Units are the domain's own: percentage points,
 * °C, or a fraction of the midpoint (0.15 = 15%). Throws a plain-language error when it is not allowed.
 */
export function validateTolerance(domain: DomainId, value: unknown): number {
  const d = DOMAINS[domain];
  const { min, max } = tolLimits(d);
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
    const scale = d.tolKind === "rel" ? 100 : 1;
    const label = tolLabel(d);
    throw new Error(`tolerance for ${domain} must be a number between ${+(min * scale).toFixed(4)} and ${+(max * scale).toFixed(4)} ${label}`);
  }
  return n;
}

function load(): SavedTolerances {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf-8"));
    const out: SavedTolerances = {};
    for (const [k, v] of Object.entries(raw?.tolerance ?? {})) {
      if (!isDomain(k)) continue;
      try {
        out[k] = validateTolerance(k, v);
      } catch {
        // a hand-edited bad value is ignored, the default applies
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const constraints = {
  all: (): SavedTolerances => load(),
  tolerance: (domain: DomainId): number | undefined => load()[domain],
  /** Save a tolerance for a domain, or pass null to go back to the default. Returns the saved set. */
  setTolerance(domain: DomainId, value: unknown): SavedTolerances {
    const saved = load();
    if (value === null || value === undefined || value === "") delete saved[domain];
    else saved[domain] = validateTolerance(domain, value);
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = file() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ tolerance: saved }, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, file());
    return saved;
  },
};
