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
  /** abs = spread in metric units, rel = spread as a share of the midpoint. */
  tolKind: "abs" | "rel";
  tol: number;
  rulePrefix: string;
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
    symbols: ["AAPL", "TSLA", "NVDA"],
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
    symbols: ["eth-gas"],
    sources: [{ id: "public-rpc" }, { id: "etherscan", key: "ETHERSCAN_API_KEY" }, { id: "llamarpc" }],
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
  if (unit === "gwei") return `${v.toFixed(v < 10 ? 2 : 1)} gwei`;
  return v.toFixed(v >= 20 ? 3 : 4);
}

export function fmtSpread(d: DomainSpec, spread: number | null, mid: number | null): string {
  if (spread === null) return "n/a";
  if (d.tolKind === "rel") return `${(((spread / Math.abs(mid || 1)) * 100) || 0).toFixed(2)}%`;
  if (d.unit === "pct") return `${spread.toFixed(2)} pp`;
  if (d.unit === "c") return `${spread.toFixed(1)} °C`;
  return spread.toFixed(4);
}

export function tolText(d: DomainSpec): string {
  if (d.tolKind === "rel") return `Conflict when the spread is more than ${+(d.tol * 100).toFixed(2)}% of the midpoint.`;
  if (d.unit === "pct") return `Conflict when the spread is more than ${d.tol.toFixed(1)} percentage point.`;
  if (d.unit === "c") return `Conflict when the spread is more than ${d.tol.toFixed(1)} °C.`;
  return `Conflict when the spread is more than ${d.tol}.`;
}

export const keyValue = (name: string): string => (process.env[name] ?? "").trim();

/** Public description for the UI: never includes key values, only whether each is set. */
export function describeDomains(sample: boolean) {
  return DOMAIN_IDS.map((id) => {
    const d = DOMAINS[id];
    return {
      id,
      metric: d.metric,
      label: d.label,
      unit: d.unit,
      symbols: d.symbols,
      tol_kind: d.tolKind,
      tol: d.tol,
      tol_text: tolText(d),
      rule_prefix: d.rulePrefix,
      sources: d.sources.map((s) => ({
        id: s.id,
        needs_key: !!s.key,
        status: sample ? "sample" : s.key && !keyValue(s.key) ? "no key" : "live",
      })),
    };
  });
}
