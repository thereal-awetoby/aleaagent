// Domains Alea can check. Each one reads a single metric for a symbol from three sources.
// Sample mode uses src/sample/fixtures.ts and needs no keys.

import { config } from "./config.ts";

export type DomainId = "crypto" | "equities" | "forex" | "defi" | "weather";
export type Unit = "pct" | "rate" | "gwei" | "c";

export interface SourceSpec {
  id: string;
  /** Name of the .env variable that holds the key, when the source needs one. */
  key?: string;
}

export interface DomainSpec {
  id: DomainId;
  /** Machine metric name, also used in Zetaris queries. */
  metric: string;
  /** Human label shown in the UI and in claims. */
  label: string;
  unit: Unit;
  symbols: string[];
  sources: SourceSpec[];
  /** Symbols that are read from their own set of sources instead of `sources` (e.g. other chains' gas). */
  symbolSources?: Record<string, SourceSpec[]>;
  /** abs = spread in metric units, rel = spread as a share of the midpoint. */
  tolKind: "abs" | "rel";
  tol: number;
  rulePrefix: string;
}

/** Chains whose gas price is read from three independent public RPC providers (no keys). */
export const GAS_CHAINS = ["polygon", "arbitrum", "base", "bsc"] as const;
function chainSources(chain: string): SourceSpec[] {
  return [{ id: `${chain}-official` }, { id: `${chain}-publicnode` }, { id: `${chain}-drpc` }];
}

export const DOMAINS: Record<DomainId, DomainSpec> = {
  crypto: {
    id: "crypto",
    metric: "change_24h",
    label: "24h change",
    unit: "pct",
    symbols: ["SOL", "BTC", "ETH", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"],
    sources: [{ id: "coingecko" }, { id: "binance" }, { id: "coinpaprika" }],
    tolKind: "abs",
    tol: config.tolerance,
    rulePrefix: "R-CRYPTO",
  },
  equities: {
    id: "equities",
    metric: "change_1d",
    label: "daily change",
    unit: "pct",
    symbols: ["AAPL", "TSLA", "NVDA", "MSFT", "SPY", "QQQ"],
    sources: [{ id: "yahoo" }, { id: "finnhub", key: "FINNHUB_API_KEY" }, { id: "alphavantage", key: "ALPHAVANTAGE_API_KEY" }],
    tolKind: "abs",
    tol: config.tolerance,
    rulePrefix: "R-EQ",
  },
  forex: {
    id: "forex",
    metric: "spot_rate",
    label: "spot rate",
    unit: "rate",
    symbols: ["EURUSD", "GBPUSD", "USDJPY"],
    sources: [{ id: "frankfurter" }, { id: "ecb" }, { id: "exchangerate-api" }],
    tolKind: "rel",
    tol: 0.005,
    rulePrefix: "R-FX",
  },
  defi: {
    id: "defi",
    metric: "gas_price",
    label: "gas price",
    unit: "gwei",
    symbols: ["eth-gas", ...GAS_CHAINS.map((c) => `${c}-gas`)],
    sources: [{ id: "public-rpc" }, { id: "etherscan", key: "ETHERSCAN_API_KEY" }, { id: "llamarpc" }],
    symbolSources: Object.fromEntries(GAS_CHAINS.map((c) => [`${c}-gas`, chainSources(c)])),
    tolKind: "rel",
    tol: 0.15,
    rulePrefix: "R-DEFI",
  },
  weather: {
    id: "weather",
    metric: "temperature",
    label: "temperature",
    unit: "c",
    symbols: ["Lagos", "London", "Tokyo"],
    sources: [{ id: "open-meteo" }, { id: "wttr.in" }, { id: "openweather", key: "OPENWEATHER_API_KEY" }],
    tolKind: "abs",
    tol: 2.0,
    rulePrefix: "R-WX",
  },
};

export const DOMAIN_IDS = Object.keys(DOMAINS) as DomainId[];

/** The sources read for one symbol: its own list when it has one, otherwise the domain's. */
export function sourcesFor(domain: DomainId, symbol: string): SourceSpec[] {
  const d = DOMAINS[domain];
  return d.symbolSources?.[symbol] ?? d.sources;
}

export const isDomain = (d: string): d is DomainId => d in DOMAINS;

/** Domain that lists this symbol (first match), used when a request names only a symbol. */
export function domainOfSymbol(symbol: string): DomainId | null {
  const s = symbol.toLowerCase();
  return DOMAIN_IDS.find((d) => DOMAINS[d].symbols.some((x) => x.toLowerCase() === s)) ?? null;
}

/** Canonical spelling of a symbol within a domain, or null when it is not listed. */
export function canonicalSymbol(domain: DomainId, symbol: string): string | null {
  const s = symbol.toLowerCase();
  return DOMAINS[domain].symbols.find((x) => x.toLowerCase() === s) ?? null;
}

export function fmtValue(unit: Unit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "n/a";
  if (unit === "pct") return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  if (unit === "c") return `${v.toFixed(1)} °C`;
  if (unit === "gwei") return `${v.toFixed(v < 0.1 ? 4 : v < 10 ? 2 : 1)} gwei`;
  return v.toFixed(v >= 20 ? 3 : 4);
}

export function fmtSpread(d: DomainSpec, spread: number | null, mid: number | null): string {
  if (spread === null) return "n/a";
  if (d.tolKind === "rel") return `${(((spread / Math.abs(mid || 1)) * 100) || 0).toFixed(2)}%`;
  if (d.unit === "pct") return `${spread.toFixed(2)} pp`;
  if (d.unit === "c") return `${spread.toFixed(1)} °C`;
  return spread.toFixed(4);
}

/** The tolerance in words: "1.0 pp", "2.0 °C", "15% of the midpoint". */
export function tolShort(d: DomainSpec, tol: number = d.tol): string {
  if (d.tolKind === "rel") return `${+(tol * 100).toFixed(2)}% of the midpoint`;
  if (d.unit === "pct") return `${tol.toFixed(1)} pp`;
  if (d.unit === "c") return `${tol.toFixed(1)} °C`;
  return String(tol);
}

/** Unit the user types a tolerance in. */
export function tolLabel(d: DomainSpec): string {
  if (d.tolKind === "rel") return "% of midpoint";
  return d.unit === "c" ? "°C" : "pp";
}

/** Smallest and largest tolerance a user may set, in the domain's own units (rel = fraction). */
export function tolLimits(d: DomainSpec): { min: number; max: number } {
  if (d.tolKind === "rel") return { min: 0.0001, max: 0.5 };
  return d.unit === "c" ? { min: 0.1, max: 25 } : { min: 0.01, max: 25 };
}

export function tolText(d: DomainSpec, tol: number = d.tol): string {
  if (d.tolKind === "rel") return `Conflict when the spread is more than ${+(tol * 100).toFixed(2)}% of the midpoint.`;
  if (d.unit === "pct") return `Conflict when the spread is more than ${tol.toFixed(1)} percentage point.`;
  if (d.unit === "c") return `Conflict when the spread is more than ${tol.toFixed(1)} °C.`;
  return `Conflict when the spread is more than ${tol}.`;
}

export const keyValue = (name: string): string => (process.env[name] ?? "").trim();

/** Public description for the UI: never includes key values, only whether each is set. */
export function describeDomains(sample: boolean, saved: Partial<Record<DomainId, number>> = {}) {
  const info = (list: SourceSpec[]) =>
    list.map((s) => ({
      id: s.id,
      needs_key: !!s.key,
      status: sample ? "sample" : s.key && !keyValue(s.key) ? "no key" : "live",
    }));
  return DOMAIN_IDS.map((id) => {
    const d = DOMAINS[id];
    const tol = saved[id] ?? d.tol;
    const limits = tolLimits(d);
    return {
      id,
      metric: d.metric,
      label: d.label,
      unit: d.unit,
      symbols: d.symbols,
      tol_kind: d.tolKind,
      /** Tolerance in force: the user's saved value, otherwise the default. */
      tol,
      tol_default: d.tol,
      tol_custom: saved[id] !== undefined,
      /** Multiply tol by this to show it in tol_label units (rel tolerances are shown in %). */
      tol_scale: d.tolKind === "rel" ? 100 : 1,
      tol_label: tolLabel(d),
      tol_min: limits.min,
      tol_max: limits.max,
      tol_text: tolText(d, tol),
      rule_prefix: d.rulePrefix,
      sources: info(d.sources),
      /** Symbols with their own sources; any symbol not listed here uses `sources`. */
      symbol_sources: Object.fromEntries(Object.entries(d.symbolSources ?? {}).map(([sym, list]) => [sym, info(list)])),
    };
  });
}
