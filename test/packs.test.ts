import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, before, describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-log-"));
for (const k of ["FINNHUB_API_KEY", "ALPHAVANTAGE_API_KEY", "ETHERSCAN_API_KEY", "OPENWEATHER_API_KEY"]) process.env[k] = "";

const { runCycle, confessPending } = await import("../src/orchestrator.ts");
const { getEngine } = await import("../src/engine.ts");
const { DOMAINS, describeDomains, domainOfSymbol, fmtValue, sourcesFor } = await import("../src/domains.ts");
const { readSource } = await import("../src/providers/sources.ts");
const { aggregate } = await import("../src/agents/aggregator.ts");

const realFetch = globalThis.fetch;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("domain packs", () => {
  it("list the new symbols and infer their domain", () => {
    for (const s of ["AMZN", "GOOGL", "META", "NFLX"]) assert.equal(domainOfSymbol(s), "equities");
    for (const s of ["USDCNY", "USDZAR", "EURGBP", "AUDUSD", "USDCAD", "USDCHF"]) assert.equal(domainOfSymbol(s), "forex");
    for (const s of ["New_York", "Nairobi", "Singapore", "Dubai", "Berlin", "Sao_Paulo"]) assert.equal(domainOfSymbol(s), "weather");
    for (const s of ["optimism-gas", "avalanche-gas"]) assert.equal(domainOfSymbol(s), "defi");
    for (const s of ["eth-tvl", "sol-tvl", "bsc-tvl", "arbitrum-tvl", "base-tvl"]) assert.equal(domainOfSymbol(s), "tvl");
  });

  it("formats TVL in USD billions", () => {
    assert.equal(fmtValue("usdb", 62.414), "$62.41B");
  });

  it("every new weather city has coordinates, and new gas chains have their own three sources", async () => {
    for (const city of DOMAINS.weather.symbols) {
      globalThis.fetch = (async (url: string) => {
        if (String(url).includes("open-meteo")) return json({ current: { temperature_2m: 21.4 } });
        return json({ current_condition: [{ temp_C: "21" }] });
      }) as typeof fetch;
      assert.equal((await readSource("weather", city, "open-meteo")).value, 21.4, city);
    }
    for (const sym of ["optimism-gas", "avalanche-gas"]) {
      assert.equal(sourcesFor("defi", sym).length, 3);
      globalThis.fetch = (async () => json({ result: "0x3b9aca00" })) as typeof fetch;
      for (const s of sourcesFor("defi", sym)) assert.equal((await readSource("defi", sym, s.id)).value, 1, `${sym}/${s.id}`);
    }
  });

  it("wttr.in is asked for New York and Sao Paulo with a space, not an underscore", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      return json({ current_condition: [{ temp_C: "15" }] });
    }) as typeof fetch;
    await readSource("weather", "New_York", "wttr.in");
    await readSource("weather", "Sao_Paulo", "wttr.in");
    assert.match(urls[0], /wttr\.in\/New%20York\?/);
    assert.match(urls[1], /wttr\.in\/Sao%20Paulo\?/);
  });

  it("reads DefiLlama chain TVL in USD billions and picks the right chain", async () => {
    globalThis.fetch = (async () => json([{ name: "Solana", tvl: 9.8e9 }, { name: "Ethereum", tvl: 62.414e9 }])) as typeof fetch;
    assert.equal((await readSource("tvl", "eth-tvl", "defillama")).value, 62.41);
    assert.equal((await readSource("tvl", "sol-tvl", "defillama")).value, 9.8);
    const miss = await readSource("tvl", "base-tvl", "defillama");
    assert.equal(miss.value, null);
    assert.equal(miss.error, "tvl missing");
  });

  it("reserved TVL sources say 'not connected' and never touch the network", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network must not be called");
    }) as typeof fetch;
    assert.deepEqual(await readSource("tvl", "eth-tvl", "tokenterminal"), { source: "tokenterminal", value: null, error: "not connected" });
    assert.equal((await readSource("tvl", "eth-tvl", "dappradar")).error, "not connected");
  });

  it("describeDomains reports reserved sources as not connected in live mode", () => {
    const tvl = describeDomains(false).find((d) => d.id === "tvl")!;
    assert.deepEqual(tvl.sources.map((s) => s.status), ["live", "not connected", "not connected"]);
    assert.ok(describeDomains(true).find((d) => d.id === "tvl")!.sources.every((s) => s.status === "sample"));
  });

  it("the ECB and exchangerate readers handle the new forex pairs", async () => {
    globalThis.fetch = (async (url: string) => {
      const u = String(url);
      if (u.includes("frankfurter")) return json({ rates: { ZAR: 18.241 } });
      if (u.includes("open.er-api.com")) return json({ result: "success", rates: { ZAR: 18.2385 } });
      const ccy = /EXR\/D\.([A-Z]+)\./.exec(u)![1];
      const perEur = { USD: 1.0852, ZAR: 19.797 }[ccy as "USD" | "ZAR"];
      return json({ dataSets: [{ series: { "0:0:0:0:0": { observations: { "0": [perEur] } } } }] });
    }) as typeof fetch;
    assert.equal((await readSource("forex", "USDZAR", "frankfurter")).value, 18.241);
    assert.equal((await readSource("forex", "USDZAR", "exchangerate-api")).value, 18.2385);
    assert.equal((await readSource("forex", "USDZAR", "ecb")).value, Number((19.797 / 1.0852).toFixed(5)));
  });
});

describe("new symbols run the full loop in sample mode", () => {
  before(async () => {
    await getEngine();
  });
  const cases: Array<[string, string]> = [
    ["AMZN", "equities"],
    ["NFLX", "equities"],
    ["USDCNY", "forex"],
    ["EURGBP", "forex"],
    ["New_York", "weather"],
    ["Sao_Paulo", "weather"],
    ["optimism-gas", "defi"],
    ["avalanche-gas", "defi"],
    ["eth-tvl", "tvl"],
    ["base-tvl", "tvl"],
  ];
  for (const [symbol, domain] of cases) {
    it(`${domain}/${symbol}: allowed, then confessed, then refused with a citation`, async () => {
      const ok = await runCycle({ domain: domain as any, symbol, scenario: "aligned", autoConfess: false });
      assert.equal(ok.decision, "stands");
      const held = await runCycle({ domain: domain as any, symbol, scenario: "conflict", autoConfess: false });
      assert.equal(held.decision, "withheld");
      const done = await confessPending(held.cycle_id);
      assert.ok(done.rule.rule_id.startsWith(DOMAINS[domain as "tvl"].rulePrefix));
      const again = await runCycle({ domain: domain as any, symbol, scenario: "conflict", autoConfess: false });
      assert.equal(again.decision, "refuse");
      assert.equal(again.refusal!.rule.confession_id, done.confession.confession_id);
    });
  }

  it("TVL aligned fixtures sit inside the 5% tolerance and conflict fixtures outside it", async () => {
    assert.equal((await aggregate("tvl", "eth-tvl", "aligned")).status, "aligned");
    assert.equal((await aggregate("tvl", "eth-tvl", "conflict")).status, "conflict");
  });
});
