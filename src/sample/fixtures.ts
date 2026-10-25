// Offline readings for SAMPLE_MODE. Every domain and symbol has an aligned and a conflict bundle.
// Sources are listed in the same order as DOMAINS[domain].sources.

import { DOMAINS, type DomainId } from "../domains.ts";
import type { Reading, Scenario } from "../types.ts";

type Pair = Record<Scenario, number[]>;

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
  },
  forex: {
    EURUSD: { aligned: [1.0852, 1.0849, 1.0855], conflict: [1.0852, 1.1041, 1.0848] },
    GBPUSD: { aligned: [1.2731, 1.2726, 1.2735], conflict: [1.2731, 1.2952, 1.2724] },
    USDJPY: { aligned: [151.42, 151.37, 151.5], conflict: [151.42, 154.1, 151.3] },
  },
  defi: {
    "eth-gas": { aligned: [24, 25, 24], conflict: [24, 31, 23] },
  },
  weather: {
    Lagos: { aligned: [28.0, 28.2, 27.9], conflict: [28.0, 34.0, 27.5] },
    London: { aligned: [12.0, 12.2, 11.9], conflict: [12.0, 18.0, 11.5] },
    Tokyo: { aligned: [18.0, 18.2, 17.9], conflict: [18.0, 24.0, 17.5] },
  },
};

export function fixture(domain: DomainId, symbol: string, scenario: Scenario): Reading[] {
  const vals = VALUES[domain]?.[symbol]?.[scenario];
  if (!vals) throw new Error(`no sample data for ${domain}/${symbol}`);
  return DOMAINS[domain].sources.map((s, i) => ({ source: s.id, value: vals[i] }));
}
