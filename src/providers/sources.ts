// Direct public sources. Used only when SAMPLE_MODE=false and Zetaris is not configured.

import { config } from "../config.ts";
import type { Asset, Reading } from "../types.ts";

const IDS: Record<Asset, { gecko: string; binance: string; paprika: string }> = {
  BTC: { gecko: "bitcoin", binance: "BTCUSDT", paprika: "btc-bitcoin" },
  ETH: { gecko: "ethereum", binance: "ETHUSDT", paprika: "eth-ethereum" },
};

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const round = (n: number) => Number(n.toFixed(2));

async function coingecko(a: Asset): Promise<number> {
  const id = IDS[a].gecko;
  const j = await getJson(`${config.coingeckoBase}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
  return round(Number(j[id].usd_24h_change));
}

async function binance(a: Asset): Promise<number> {
  const q = `/api/v3/ticker/24hr?symbol=${IDS[a].binance}`;
  try {
    return round(Number((await getJson(`https://api.binance.com${q}`)).priceChangePercent));
  } catch {
    return round(Number((await getJson(`https://data-api.binance.vision${q}`)).priceChangePercent));
  }
}

async function coinpaprika(a: Asset): Promise<number> {
  const j = await getJson(`https://api.coinpaprika.com/v1/tickers/${IDS[a].paprika}`);
  return round(Number(j.quotes.USD.percent_change_24h));
}

export async function fetchDirect(symbol: Asset): Promise<Reading[]> {
  const jobs: Array<[string, () => Promise<number>]> = [
    ["coingecko", () => coingecko(symbol)],
    ["binance", () => binance(symbol)],
    ["coinpaprika", () => coinpaprika(symbol)],
  ];
  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  return settled.map((s, i) =>
    s.status === "fulfilled" && Number.isFinite(s.value)
      ? { source: jobs[i][0], value: s.value }
      : { source: jobs[i][0], value: null, error: s.status === "rejected" ? String(s.reason?.message ?? s.reason) : "not a number" },
  );
}
