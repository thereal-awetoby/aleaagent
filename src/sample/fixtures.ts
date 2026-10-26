// Offline readings for SAMPLE_MODE. Every domain and symbol has an aligned and a conflict bundle.
// Sources are listed in the same order as sourcesFor(domain, symbol).
// For domains with windows (crypto, equities, weather), fixtures are keyed by symbol then window.

import { sourcesFor, type DomainId } from "../domains.ts";
import type { Reading, Scenario } from "../types.ts";

type Pair = Record<Scenario, number[]>;

/** Default (no-window or default-window) fixtures. */
const VALUES: Record<DomainId, Record<string, Pair>> = {
  crypto: {
    BTC: { aligned: [5.42, 5.38, 5.51], conflict: [5.84, 4.12, 6.21] },
    ETH: { aligned: [3.1, 3.05, 3.16], conflict: [4.3, 2.6, 3.9] },
    SOL: { aligned: [8.1, 8.3, 8.0], conflict: [8.1, 11.6, 7.9] },
    BNB: { aligned: [1.82, 1.76, 1.9], conflict: [1.82, 3.4, 1.71] },
    XRP: { aligned: [2.45, 2.52, 2.38], conflict: [2.45, 4.1, 2.31] },
    DOGE: { aligned: [4.3, 4.21, 4.42], conflict: [4.3, 6.15, 4.18] },
    ADA: { aligned: [3.05, 3.12, 2.98], conflict: [3.05, 1.4, 3.1] },
    AVAX: { aligned: [6.2, 6.35, 6.11], conflict: [6.2, 8.3, 6.05] },
    LINK: { aligned: [2.9, 2.84, 3.01], conflict: [2.9, 4.55, 2.81] },
    DOT: { aligned: [1.15, 1.22, 1.08], conflict: [1.15, 2.75, 1.04] },
  },
  equities: {
    AAPL: { aligned: [1.2, 1.3, 1.1], conflict: [1.2, 3.1, 1.0] },
    TSLA: { aligned: [1.6, 1.7, 1.5], conflict: [1.6, 3.5, 1.4] },
    NVDA: { aligned: [2.0, 2.1, 1.9], conflict: [2.0, 3.9, 1.8] },
    MSFT: { aligned: [0.8, 0.9, 0.7], conflict: [0.8, 2.4, 0.6] },
    SPY: { aligned: [0.35, 0.4, 0.3], conflict: [0.35, 1.8, 0.3] },
    QQQ: { aligned: [0.55, 0.6, 0.5], conflict: [0.55, 2.1, 0.45] },
    AMZN: { aligned: [0.9, 1.0, 0.8], conflict: [0.9, 2.6, 0.7] },
    GOOGL: { aligned: [1.1, 1.2, 1.0], conflict: [1.1, 2.9, 0.9] },
    META: { aligned: [1.4, 1.5, 1.3], conflict: [1.4, 3.2, 1.2] },
    NFLX: { aligned: [1.7, 1.8, 1.6], conflict: [1.7, 3.6, 1.5] },
  },
  forex: {
    EURUSD: { aligned: [1.0852, 1.0849, 1.0855], conflict: [1.0852, 1.1041, 1.0848] },
    GBPUSD: { aligned: [1.2731, 1.2726, 1.2735], conflict: [1.2731, 1.2952, 1.2724] },
    USDJPY: { aligned: [151.42, 151.37, 151.5], conflict: [151.42, 154.1, 151.3] },
    USDCNY: { aligned: [7.1215, 7.1208, 7.1222], conflict: [7.1215, 7.241, 7.1209] },
    USDZAR: { aligned: [18.241, 18.2385, 18.244], conflict: [18.241, 18.61, 18.236] },
    EURGBP: { aligned: [0.8512, 0.8509, 0.8515], conflict: [0.8512, 0.869, 0.8508] },
    AUDUSD: { aligned: [0.6612, 0.6609, 0.6615], conflict: [0.6612, 0.679, 0.6608] },
    USDCAD: { aligned: [1.365, 1.3646, 1.3655], conflict: [1.365, 1.392, 1.3644] },
    USDCHF: { aligned: [0.884, 0.8836, 0.8844], conflict: [0.884, 0.902, 0.8834] },
  },
  defi: {
    "eth-gas": { aligned: [24, 25, 24], conflict: [24, 31, 23] },
    "polygon-gas": { aligned: [34.8, 35.1, 35.4], conflict: [34.8, 52, 35.2] },
    "arbitrum-gas": { aligned: [0.02, 0.0205, 0.0198], conflict: [0.02, 0.032, 0.0195] },
    "base-gas": { aligned: [0.005, 0.0052, 0.0049], conflict: [0.005, 0.0085, 0.0048] },
    "bsc-gas": { aligned: [0.05, 0.0505, 0.0498], conflict: [0.05, 0.08, 0.0495] },
    "optimism-gas": { aligned: [0.001, 0.00102, 0.00099], conflict: [0.001, 0.0016, 0.00098] },
    "avalanche-gas": { aligned: [25, 25.4, 24.8], conflict: [25, 36, 24.6] },
  },
  tvl: {
    "eth-tvl": { aligned: [62.41, 62.18, 62.7], conflict: [62.41, 71.3, 62.05] },
    "sol-tvl": { aligned: [9.84, 9.79, 9.9], conflict: [9.84, 11.6, 9.75] },
    "bsc-tvl": { aligned: [5.62, 5.58, 5.67], conflict: [5.62, 6.7, 5.55] },
    "arbitrum-tvl": { aligned: [3.21, 3.19, 3.24], conflict: [3.21, 3.9, 3.17] },
    "base-tvl": { aligned: [4.38, 4.35, 4.42], conflict: [4.38, 5.3, 4.33] },
  },
  weather: {
    Lagos: { aligned: [28.0, 28.2, 27.9], conflict: [28.0, 34.0, 27.5] },
    London: { aligned: [12.0, 12.2, 11.9], conflict: [12.0, 18.0, 11.5] },
    Tokyo: { aligned: [18.0, 18.2, 17.9], conflict: [18.0, 24.0, 17.5] },
    New_York: { aligned: [15.0, 15.2, 14.9], conflict: [15.0, 21.0, 14.5] },
    Nairobi: { aligned: [22.0, 22.3, 21.8], conflict: [22.0, 28.0, 21.5] },
    Singapore: { aligned: [30.0, 30.2, 29.9], conflict: [30.0, 36.0, 29.5] },
    Dubai: { aligned: [34.0, 34.3, 33.8], conflict: [34.0, 40.0, 33.5] },
    Berlin: { aligned: [10.0, 10.2, 9.9], conflict: [10.0, 16.0, 9.5] },
    Sao_Paulo: { aligned: [24.0, 24.3, 23.8], conflict: [24.0, 30.0, 23.5] },
  },
  sports: {
    "EPL-F1": { aligned: [54.0, 54.4, 53.8], conflict: [54.0, 62.0, 53.5] },
    "NBA-G1": { aligned: [61.2, 61.5, 60.9], conflict: [61.2, 72.0, 60.5] },
    "EPL-F2": { aligned: [48.5, 48.9, 48.1], conflict: [48.5, 58.0, 47.8] },
  },
};

/** Window-specific fixtures. Keyed domain → symbol → window → Pair.
 *  For crypto/equities, 1d reuses the default VALUES (mapped from change_24h / change_1d).
 *  7d and 30d have distinct numbers so demos show different metrics. */
const WINDOW_VALUES: Partial<Record<DomainId, Record<string, Record<string, Pair>>>> = {
  crypto: {
    SOL: {
      "1h": { aligned: [0.42, 0.45, 0.40], conflict: [0.42, 1.8, 0.38] },
      "7d": { aligned: [12.4, 12.6, 12.2], conflict: [12.4, 18.1, 12.0] },
      "30d": { aligned: [22.1, 22.4, 21.8], conflict: [22.1, 31.5, 21.5] },
    },
    BTC: {
      "7d": { aligned: [4.1, 4.2, 4.0], conflict: [4.1, 7.8, 3.9] },
      "30d": { aligned: [9.5, 9.7, 9.3], conflict: [9.5, 15.2, 9.1] },
    },
    ETH: {
      "7d": { aligned: [6.2, 6.3, 6.1], conflict: [6.2, 11.0, 5.9] },
      "30d": { aligned: [14.0, 14.3, 13.8], conflict: [14.0, 21.5, 13.5] },
    },
  },
  equities: {
    AAPL: {
      "7d": { aligned: [2.4, 2.5, 2.3], conflict: [2.4, 5.1, 2.2] },
      "30d": { aligned: [5.1, 5.3, 4.9], conflict: [5.1, 9.2, 4.8] },
    },
    TSLA: {
      "7d": { aligned: [3.2, 3.4, 3.1], conflict: [3.2, 7.0, 3.0] },
      "30d": { aligned: [8.0, 8.2, 7.8], conflict: [8.0, 14.5, 7.6] },
    },
  },
  weather: {
    Lagos: {
      "7d": { aligned: [27.5, 27.7, 27.4], conflict: [27.5, 32.0, 27.2] },
    },
    London: {
      "7d": { aligned: [11.2, 11.4, 11.1], conflict: [11.2, 16.5, 10.9] },
    },
  },
};

export function fixture(domain: DomainId, symbol: string, scenario: Scenario, window?: string | null): Reading[] {
  let vals: number[] | undefined;

  if (window && WINDOW_VALUES[domain]?.[symbol]?.[window]) {
    vals = WINDOW_VALUES[domain]![symbol]![window]![scenario];
  }

  // Fall back to default VALUES for the default window (1d / now) or domains without windows.
  if (!vals) {
    vals = VALUES[domain]?.[symbol]?.[scenario];
  }

  // Last resort: reuse a known symbol's numbers so SAMPLE never hard-crashes on a missing window fixture.
  if (!vals) {
    const first = Object.values(VALUES[domain] ?? {})[0];
    vals = first?.[scenario];
  }

  if (!vals) throw new Error(`no sample data for ${domain}/${symbol}${window ? `/${window}` : ""}`);
  return sourcesFor(domain, symbol).map((s, i) => ({ source: s.id, value: vals![i] }));
}
