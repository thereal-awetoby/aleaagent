import type { Asset, Reading, Scenario } from "../types.ts";

const r = (source: string, value: number): Reading => ({ source, value });

export const FIXTURES: Record<Asset, Record<Scenario, Reading[]>> = {
  BTC: {
    aligned: [r("coingecko", 5.42), r("binance", 5.38), r("coinpaprika", 5.51)],
    conflict: [r("coingecko", 5.84), r("binance", 4.12), r("coinpaprika", 6.21)],
  },
  ETH: {
    aligned: [r("coingecko", 3.1), r("binance", 3.05), r("coinpaprika", 3.16)],
    conflict: [r("coingecko", 4.3), r("binance", 2.6), r("coinpaprika", 3.9)],
  },
};
