// Direct public sources. Used only when SAMPLE_MODE=false and Zetaris is not configured.
// Keys are read from .env only. A source whose key is missing returns "no key" and is never called.
// Error messages carry the HTTP status or the provider's own message, never a URL or a key.

import { config } from "../config.ts";
import { GAS_CHAINS, keyValue, sourcesFor, type DomainId } from "../domains.ts";
import type { Reading } from "../types.ts";

/** Window id passed through for metric selection. Live sources that lack a field return null (honest partial). */
type WindowId = string | null | undefined;

const UA = "Mozilla/5.0 (compatible; alea-agent/0.1)";

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json", "user-agent": UA, ...((init.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const num = (v: unknown, what: string): number => {
  const n = typeof v === "string" ? Number(v.replace(/[%,\s]/g, "")) : Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) throw new Error(`${what} missing`);
  return n;
};

const round = (n: number, d = 2) => Number(n.toFixed(d));

// ---------- crypto: 24h change (%) ----------

const CRYPTO: Record<string, { gecko: string; binance: string; paprika: string }> = {
  BTC: { gecko: "bitcoin", binance: "BTCUSDT", paprika: "btc-bitcoin" },
  ETH: { gecko: "ethereum", binance: "ETHUSDT", paprika: "eth-ethereum" },
  SOL: { gecko: "solana", binance: "SOLUSDT", paprika: "sol-solana" },
  BNB: { gecko: "binancecoin", binance: "BNBUSDT", paprika: "bnb-binance-coin" },
  XRP: { gecko: "ripple", binance: "XRPUSDT", paprika: "xrp-xrp" },
  DOGE: { gecko: "dogecoin", binance: "DOGEUSDT", paprika: "doge-dogecoin" },
  ADA: { gecko: "cardano", binance: "ADAUSDT", paprika: "ada-cardano" },
  AVAX: { gecko: "avalanche-2", binance: "AVAXUSDT", paprika: "avax-avalanche" },
  LINK: { gecko: "chainlink", binance: "LINKUSDT", paprika: "link-chainlink" },
  DOT: { gecko: "polkadot", binance: "DOTUSDT", paprika: "dot-polkadot" },
};

async function coingecko(s: string, _key?: string, window?: WindowId): Promise<number> {
  const id = CRYPTO[s].gecko;
  // CoinGecko simple/price only has 24h. For 7d/30d use /coins/{id} market_data.
  if (!window || window === "1d") {
    const j = await getJson(`${config.coingeckoBase}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
    return round(num(j[id]?.usd_24h_change, "usd_24h_change"));
  }
  const j = await getJson(`${config.coingeckoBase}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`);
  const md = j.market_data;
  if (window === "7d") return round(num(md?.price_change_percentage_7d_in_currency?.usd ?? md?.price_change_percentage_7d, "7d change"));
  if (window === "30d") return round(num(md?.price_change_percentage_30d_in_currency?.usd ?? md?.price_change_percentage_30d, "30d change"));
  throw new Error(`unsupported window ${window}`);
}

async function binance(s: string, _key?: string, window?: WindowId): Promise<number> {
  // Binance public ticker is 24h only. Non-1d windows are honest partials (do not synthesize).
  if (window && window !== "1d") throw new Error("binance has no 7d/30d ticker");
  const q = `/api/v3/ticker/24hr?symbol=${CRYPTO[s].binance}`;
  try {
    return round(num((await getJson(`https://api.binance.com${q}`)).priceChangePercent, "priceChangePercent"));
  } catch {
    return round(num((await getJson(`https://data-api.binance.vision${q}`)).priceChangePercent, "priceChangePercent"));
  }
}

async function coinpaprika(s: string, _key?: string, window?: WindowId): Promise<number> {
  const j = await getJson(`https://api.coinpaprika.com/v1/tickers/${CRYPTO[s].paprika}`);
  const q = j.quotes?.USD;
  if (!window || window === "1d") return round(num(q?.percent_change_24h, "percent_change_24h"));
  if (window === "7d") return round(num(q?.percent_change_7d, "percent_change_7d"));
  if (window === "30d") return round(num(q?.percent_change_30d, "percent_change_30d"));
  throw new Error(`unsupported window ${window}`);
}

// ---------- equities: daily change (%) ----------

async function yahoo(s: string): Promise<number> {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1d`);
  const meta = j.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(String(j.chart?.error?.description ?? "no chart data").slice(0, 60));
  if (meta.regularMarketChangePercent !== undefined) return round(num(meta.regularMarketChangePercent, "regularMarketChangePercent"));
  const prev = num(meta.chartPreviousClose ?? meta.previousClose, "previous close");
  return round(((num(meta.regularMarketPrice, "price") - prev) / prev) * 100);
}

async function finnhub(s: string, key: string): Promise<number> {
  const j = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}`, { headers: { "X-Finnhub-Token": key } });
  return round(num(j.dp, "dp"));
}

async function alphavantage(s: string, key: string): Promise<number> {
  const j = await getJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(s)}&apikey=${encodeURIComponent(key)}`);
  if (j.Note || j.Information) throw new Error("rate limited");
  if (j["Error Message"]) throw new Error("rejected");
  return round(num(j["Global Quote"]?.["10. change percent"], "change percent"));
}

// ---------- forex: spot rate ----------

const pair = (s: string) => ({ base: s.slice(0, 3), quote: s.slice(3, 6) });
const fxDigits = (v: number) => (v >= 20 ? 3 : 5);

async function frankfurter(s: string): Promise<number> {
  const { base, quote } = pair(s);
  let j: any;
  try {
    j = await getJson(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`);
  } catch {
    j = await getJson(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
  }
  const v = num(j.rates?.[quote], "rate");
  return round(v, fxDigits(v));
}

/** ECB reference rates are quoted as units of currency per 1 EUR. */
async function ecbPerEur(ccy: string): Promise<number> {
  if (ccy === "EUR") return 1;
  const j = await getJson(`https://data-api.ecb.europa.eu/service/data/EXR/D.${ccy}.EUR.SP00.A?lastNObservations=1&format=jsondata`);
  const series: any = Object.values(j.dataSets?.[0]?.series ?? {})[0];
  const obs: any[] = Object.values(series?.observations ?? {});
  return num(obs[obs.length - 1]?.[0], `ECB ${ccy}`);
}

async function ecb(s: string): Promise<number> {
  const { base, quote } = pair(s);
  const [b, q] = await Promise.all([ecbPerEur(base), ecbPerEur(quote)]);
  const v = q / b;
  return round(v, fxDigits(v));
}

async function exchangerateApi(s: string): Promise<number> {
  const { base, quote } = pair(s);
  const j = await getJson(`https://open.er-api.com/v6/latest/${base}`);
  if (j.result && j.result !== "success") throw new Error(String(j["error-type"] ?? "error").slice(0, 60));
  const v = num(j.rates?.[quote], "rate");
  return round(v, fxDigits(v));
}

// ---------- defi: Ethereum gas price (gwei) ----------

type Fetcher = (symbol: string, key: string, window?: WindowId) => Promise<number>;

async function rpcGas(url: string, digits = 3): Promise<number> {
  const j = await getJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
  });
  if (typeof j.result !== "string") throw new Error(j.error ? "rpc error" : "no result");
  return round(Number(BigInt(j.result)) / 1e9, digits);
}

async function etherscan(_s: string, key: string): Promise<number> {
  const j = await getJson(`https://api.etherscan.io/v2/api?chainid=1&module=gastracker&action=gasoracle&apikey=${encodeURIComponent(key)}`);
  if (j.status !== "1") throw new Error(String(j.message ?? "rejected").slice(0, 60));
  return round(num(j.result?.ProposeGasPrice, "ProposeGasPrice"), 3);
}

// Other chains: three independent public RPC providers each, no keys. Layer-2 gas prices are
// well below 0.001 gwei, so these are kept to 6 decimals.
const CHAIN_RPC: Record<(typeof GAS_CHAINS)[number], { official: string; publicnode: string; drpc: string }> = {
  polygon: { official: "https://polygon-rpc.com", publicnode: "https://polygon-bor-rpc.publicnode.com", drpc: "https://polygon.drpc.org" },
  arbitrum: { official: "https://arb1.arbitrum.io/rpc", publicnode: "https://arbitrum-one-rpc.publicnode.com", drpc: "https://arbitrum.drpc.org" },
  base: { official: "https://mainnet.base.org", publicnode: "https://base-rpc.publicnode.com", drpc: "https://base.drpc.org" },
  bsc: { official: "https://bsc-dataseed.binance.org", publicnode: "https://bsc-rpc.publicnode.com", drpc: "https://bsc.drpc.org" },
  optimism: { official: "https://mainnet.optimism.io", publicnode: "https://optimism-rpc.publicnode.com", drpc: "https://optimism.drpc.org" },
  avalanche: { official: "https://api.avax.network/ext/bc/C/rpc", publicnode: "https://avalanche-c-chain-rpc.publicnode.com", drpc: "https://avalanche.drpc.org" },
};
const chainFetchers: Record<string, Fetcher> = {};
for (const chain of GAS_CHAINS) {
  for (const kind of ["official", "publicnode", "drpc"] as const) {
    chainFetchers[`${chain}-${kind}`] = () => rpcGas(CHAIN_RPC[chain][kind], 6);
  }
}

// ---------- tvl: total value locked on a chain (USD billions) ----------

const TVL_CHAIN: Record<string, string> = {
  "eth-tvl": "Ethereum",
  "sol-tvl": "Solana",
  "bsc-tvl": "BSC",
  "arbitrum-tvl": "Arbitrum",
  "base-tvl": "Base",
};

async function defillama(s: string): Promise<number> {
  const j = await getJson("https://api.llama.fi/v2/chains");
  const row = Array.isArray(j) ? j.find((c: any) => c?.name === TVL_CHAIN[s]) : undefined;
  return round(num(row?.tvl, "tvl") / 1e9, 2);
}

// ---------- weather: current temperature (°C) ----------

const CITIES: Record<string, { lat: number; lon: number }> = {
  Lagos: { lat: 6.5244, lon: 3.3792 },
  London: { lat: 51.5074, lon: -0.1278 },
  Tokyo: { lat: 35.6762, lon: 139.6503 },
  New_York: { lat: 40.7128, lon: -74.006 },
  Nairobi: { lat: -1.2921, lon: 36.8219 },
  Singapore: { lat: 1.3521, lon: 103.8198 },
  Dubai: { lat: 25.2048, lon: 55.2708 },
  Berlin: { lat: 52.52, lon: 13.405 },
  Sao_Paulo: { lat: -23.5505, lon: -46.6333 },
};

async function openMeteo(s: string, _key?: string, window?: WindowId): Promise<number> {
  const c = CITIES[s];
  if (window === "7d") {
    // Locked definition: 7-day mean of daily mean temperature for the last 7 complete days.
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=temperature_2m_mean&past_days=7&forecast_days=0&timezone=UTC`,
    );
    const days: number[] = (j.daily?.temperature_2m_mean ?? []).filter((v: unknown) => typeof v === "number" && Number.isFinite(v));
    if (days.length < 7) throw new Error("need 7 daily means");
    const mean = days.slice(-7).reduce((a, b) => a + b, 0) / 7;
    return round(mean, 1);
  }
  const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m`);
  return round(num(j.current?.temperature_2m, "temperature_2m"), 1);
}

async function wttr(s: string, _key?: string, window?: WindowId): Promise<number> {
  // wttr.in has no reliable 7d mean; non-now is honest partial.
  if (window === "7d") throw new Error("wttr.in has no 7d mean");
  const j = await getJson(`https://wttr.in/${encodeURIComponent(s.replace(/_/g, " "))}?format=j1`);
  return round(num(j.current_condition?.[0]?.temp_C, "temp_C"), 1);
}

async function openweather(s: string, key: string, window?: WindowId): Promise<number> {
  if (window === "7d") throw new Error("openweather free tier has no 7d mean");
  const c = CITIES[s];
  const j = await getJson(`https://api.openweathermap.org/data/2.5/weather?lat=${c.lat}&lon=${c.lon}&units=metric&appid=${encodeURIComponent(key)}`);
  return round(num(j.main?.temp, "main.temp"), 1);
}

// ---------- registry ----------

const FETCHERS: Record<DomainId, Record<string, Fetcher>> = {
  crypto: { coingecko, binance, coinpaprika },
  equities: { yahoo, finnhub, alphavantage },
  forex: { frankfurter, ecb, "exchangerate-api": exchangerateApi },
  defi: {
    "public-rpc": () => rpcGas("https://ethereum-rpc.publicnode.com"),
    etherscan,
    llamarpc: () => rpcGas("https://eth.llamarpc.com"),
    ...chainFetchers,
  },
  tvl: { defillama },
  weather: { "open-meteo": openMeteo, "wttr.in": wttr, openweather },
  // sports is SAMPLE-only in v1; no live fetchers.
  sports: {},
};

/** Read one source. Never throws: failures and missing keys come back as value null with an error. */
export async function readSource(domain: DomainId, symbol: string, source: string, window?: WindowId): Promise<Reading> {
  const spec = sourcesFor(domain, symbol).find((s) => s.id === source);
  const fn = FETCHERS[domain]?.[source];
  if (spec?.unwired) return { source, value: null, error: "not connected" };
  if (!spec || !fn) return { source, value: null, error: "unknown source" };
  const key = spec.key ? keyValue(spec.key) : "";
  if (spec.key && !key) return { source, value: null, error: "no key" };
  try {
    const value = await fn(symbol, key, window);
    return Number.isFinite(value) ? { source, value } : { source, value: null, error: "not a number" };
  } catch (err) {
    const e = err as Error;
    const msg = e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : String(e?.message ?? err);
    // Never echo anything that could contain a key.
    return { source, value: null, error: key ? msg.split(key).join("***").slice(0, 80) : msg.slice(0, 80) };
  }
}

export async function fetchDirect(domain: DomainId, symbol: string, window?: WindowId): Promise<Reading[]> {
  return Promise.all(sourcesFor(domain, symbol).map((s) => readSource(domain, symbol, s.id, window)));
}
