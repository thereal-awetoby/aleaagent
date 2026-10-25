import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-log-"));
for (const k of ["FINNHUB_API_KEY", "ALPHAVANTAGE_API_KEY", "ETHERSCAN_API_KEY", "OPENWEATHER_API_KEY"]) process.env[k] = "";

const { runCycle, confessPending } = await import("../src/orchestrator.ts");
const { classify, aggregate } = await import("../src/agents/aggregator.ts");
const { getEngine } = await import("../src/engine.ts");
const { DOMAINS, DOMAIN_IDS } = await import("../src/domains.ts");
const { readSource } = await import("../src/providers/sources.ts");
const { refusals } = await import("../src/memory/store.ts");

describe("classify", () => {
  it("labels aligned, conflict and partial bundles", () => {
    const r = (v: number | null) => ({ source: "s", value: v });
    assert.equal(classify([r(5.4), r(5.5), r(5.3)], 1, 3).status, "aligned");
    assert.equal(classify([r(5.8), r(4.1), r(6.2)], 1, 3).status, "conflict");
    assert.equal(classify([r(5.4), r(null), r(5.3)], 1, 3).status, "partial");
  });

  it("supports a tolerance relative to the midpoint", () => {
    const r = (v: number) => ({ source: "s", value: v });
    assert.equal(classify([r(24), r(25), r(24)], 0.15, 3, "rel").status, "aligned");
    assert.equal(classify([r(24), r(31), r(23)], 0.15, 3, "rel").status, "conflict");
  });
});

describe("sample fixtures", () => {
  it("cover every domain and symbol, aligned and conflict, with no keys", async () => {
    for (const d of DOMAIN_IDS) {
      for (const s of DOMAINS[d].symbols) {
        const a = await aggregate(d, s, "aligned");
        const c = await aggregate(d, s, "conflict");
        assert.equal(a.status, "aligned", `${d}/${s} aligned`);
        assert.equal(c.status, "conflict", `${d}/${s} conflict`);
        assert.deepEqual(a.readings.map((x) => x.source), DOMAINS[d].sources.map((x) => x.id));
      }
    }
  });
});

describe("live sources", () => {
  it("report a missing key as 'no key' without calling the network", async () => {
    const r = await readSource("equities", "AAPL", "finnhub");
    assert.deepEqual(r, { source: "finnhub", value: null, error: "no key" });
    const w = await readSource("weather", "Lagos", "openweather");
    assert.equal(w.error, "no key");
  });
});

describe("confession loop", () => {
  let firstId = "";
  before(async () => {
    await getEngine();
  });

  it("lets an aligned claim stand and writes nothing", async () => {
    const r = await runCycle({ symbol: "BTC", threshold: 5, scenario: "aligned" });
    assert.equal(r.decision, "stands");
    assert.equal(r.confession, undefined);
  });

  it("confesses on source conflict and emits R-CRYPTO-001", async () => {
    const r = await runCycle({ symbol: "BTC", threshold: 5, scenario: "conflict" });
    assert.equal(r.decision, "confess");
    assert.equal(r.confession?.error_type, "source_conflict");
    assert.equal(r.rule?.rule_id, "R-CRYPTO-001");
    firstId = r.confession!.confession_id;
  });

  it("refuses the same pattern, cites the confession and counts the refusal", async () => {
    const r = await runCycle({ symbol: "BTC", threshold: 5, scenario: "conflict" });
    assert.equal(r.decision, "refuse");
    assert.equal(r.refusal?.rule.confession_id, firstId);
    assert.ok(r.refusal!.recall.hits.length > 0, "H-MEM should recall the confession");
    assert.equal(refusals.counts()[firstId], 1);
  });

  it("does not refuse a different asset", async () => {
    const r = await runCycle({ symbol: "ETH", threshold: 3, scenario: "aligned" });
    assert.equal(r.decision, "stands");
  });

  it("learns from a false claim on aligned sources", async () => {
    const miss = await runCycle({ symbol: "ETH", threshold: 5, scenario: "aligned" });
    assert.equal(miss.decision, "confess");
    assert.equal(miss.confession?.error_type, "claim_false");
    const again = await runCycle({ symbol: "ETH", threshold: 6, scenario: "aligned" });
    assert.equal(again.decision, "refuse");
    const fine = await runCycle({ symbol: "ETH", threshold: 3, scenario: "aligned" });
    assert.equal(fine.decision, "stands");
  });
});

describe("manual confession step (main UI)", () => {
  it("withholds on conflict, confesses on request, then refuses and counts", async () => {
    const ok = await runCycle({ domain: "weather", symbol: "Lagos", scenario: "aligned", autoConfess: false });
    assert.equal(ok.decision, "stands");
    assert.match(ok.claim!.text, /Lagos temperature is about 28\.0 °C/);

    const held = await runCycle({ domain: "weather", symbol: "Lagos", scenario: "conflict", autoConfess: false });
    assert.equal(held.decision, "withheld");
    assert.equal(held.error_type, "source_conflict");
    assert.equal(held.confession, undefined);

    const { confession, rule } = await confessPending(held.cycle_id);
    assert.equal(rule.rule_id, "R-WX-001");
    assert.equal(confession.domain, "weather");
    await assert.rejects(confessPending(held.cycle_id));

    const r1 = await runCycle({ domain: "weather", symbol: "Lagos", scenario: "conflict", autoConfess: false });
    const r2 = await runCycle({ domain: "weather", symbol: "Lagos", scenario: "conflict", autoConfess: false });
    assert.equal(r1.decision, "refuse");
    assert.equal(r2.refusal?.rule.confession_id, confession.confession_id);
    assert.equal(refusals.counts()[confession.confession_id], 2);

    const other = await runCycle({ domain: "weather", symbol: "Tokyo", scenario: "conflict", autoConfess: false });
    assert.equal(other.decision, "withheld");
  });
});

describe("Zetaris adapter (guide contract)", () => {
  it("sends the guide's request shape and reads data rows", async () => {
    const { config } = await import("../src/config.ts");
    const { queryReadings } = await import("../src/providers/zetaris.ts");
    Object.assign(config.zetaris, { restUrl: "http://zetaris.test/api/v1.0", orgId: "1", apiKey: "k-test", table: "alea_readings" });
    const realFetch = globalThis.fetch;
    let seen: { url: string; init: any } | null = null;
    globalThis.fetch = (async (url: string, init: any) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: [["coingecko", 5.42], ["binance", "5.38"]] }), { status: 200 });
    }) as typeof fetch;
    try {
      const out = await queryReadings("BTC", "change_24h");
      assert.equal(seen!.url, "http://zetaris.test/api/v1.0/sql-editor/sqls/run");
      assert.equal(seen!.init.headers.authorization, "Bearer k-test");
      assert.equal(seen!.init.headers["X-Org-ID"], "1");
      assert.match(seen!.init.headers["X-Request-ID"], /^[0-9a-f-]{36}$/);
      const body = JSON.parse(seen!.init.body);
      assert.equal(body.source, "SqlEditor");
      assert.match(body.sql, /FROM alea_readings WHERE symbol = 'BTC' AND metric = 'change_24h'/);
      assert.deepEqual(out.readings, [{ source: "coingecko", value: 5.42 }, { source: "binance", value: 5.38 }]);
    } finally {
      globalThis.fetch = realFetch;
      Object.assign(config.zetaris, { restUrl: "", apiKey: "" });
    }
  });
});

describe("Nightshift adapter (guide contract)", () => {
  it("sends meterless headers, retries once, and reports the answering model", async () => {
    const { config } = await import("../src/config.ts");
    const { complete } = await import("../src/providers/nightshift.ts");
    Object.assign(config.nightshift, { baseUrl: "http://ns.test/v1", apiKey: "t-test", model: "meterless/auto", app: "alea-agent" });
    const realFetch = globalThis.fetch;
    const calls: any[] = [];
    globalThis.fetch = (async (url: string, init: any) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ model: "nvidia/nemotron-test", choices: [{ message: { content: "ready" } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const out = await complete("sys", "user");
      assert.equal(calls.length, 2, "one retry after a failure");
      assert.equal(calls[1].url, "http://ns.test/v1/chat/completions");
      assert.equal(calls[1].init.headers["meterless-app"], "alea-agent");
      assert.equal(calls[1].init.headers["meterless-scope"], "user");
      assert.deepEqual(out, { text: "ready", model: "nvidia/nemotron-test", attempts: 2 });
    } finally {
      globalThis.fetch = realFetch;
      Object.assign(config.nightshift, { baseUrl: "", apiKey: "" });
    }
  });
});

describe("trace", () => {
  it("records which model handled each step", async () => {
    const r = await runCycle({ domain: "crypto", symbol: "SOL", scenario: "aligned", autoConfess: false });
    const claimStep = r.trace.find((e) => e.type === "claim");
    assert.equal(claimStep?.model, "template");
    assert.ok(r.trace.every((e) => typeof e.model === "string"));
  });
});
