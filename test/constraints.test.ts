import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-log-"));

const { aggregate } = await import("../src/agents/aggregator.ts");
const { runCycle, confessPending } = await import("../src/orchestrator.ts");
const { constraints, validateTolerance } = await import("../src/memory/constraints.ts");
const { describeDomains, DOMAINS } = await import("../src/domains.ts");
const { confessions, rules } = await import("../src/memory/store.ts");
const { resetEngine } = await import("../src/engine.ts");

describe("tolerance on a single run", () => {
  it("a tight tolerance turns an aligned bundle into a conflict", async () => {
    const dflt = await aggregate("crypto", "SOL", "aligned");
    assert.equal(dflt.status, "aligned");
    assert.equal(dflt.tolerance, 1.0);
    assert.equal(dflt.tolerance_source, "default");
    const tight = await aggregate("crypto", "SOL", "aligned", 0.1);
    assert.equal(tight.status, "conflict");
    assert.equal(tight.tolerance, 0.1);
    assert.equal(tight.tolerance_default, 1.0);
    assert.equal(tight.tolerance_source, "run");
  });

  it("a wide tolerance turns a conflict into aligned", async () => {
    const wide = await aggregate("crypto", "SOL", "conflict", 10);
    assert.equal(wide.status, "aligned");
  });

  it("works with a tolerance relative to the midpoint", async () => {
    assert.equal((await aggregate("forex", "EURUSD", "aligned")).status, "aligned");
    assert.equal((await aggregate("forex", "EURUSD", "aligned", 0.00005)).status, "conflict");
  });
});

describe("saved tolerance per domain", () => {
  it("applies to every run in that domain, only that domain, and can be reset", async () => {
    constraints.setTolerance("weather", 0.1);
    const wx = await aggregate("weather", "Lagos", "aligned");
    assert.equal(wx.status, "conflict", "0.1 °C is tighter than the 0.2 °C spread of the sample");
    assert.equal(wx.tolerance_source, "saved");
    const crypto = await aggregate("crypto", "SOL", "aligned");
    assert.equal(crypto.tolerance_source, "default");
    assert.equal(crypto.status, "aligned");
    // a one-off run tolerance wins over the saved one
    assert.equal((await aggregate("weather", "Lagos", "aligned", 5)).tolerance_source, "run");
    constraints.setTolerance("weather", null);
    assert.equal((await aggregate("weather", "Lagos", "aligned")).tolerance_source, "default");
  });

  it("is stored on disk and survives a reload of the store", () => {
    constraints.setTolerance("equities", 2.5);
    const file = path.join(process.env.ALEA_DATA_DIR as string, "constraints.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf-8")), { tolerance: { equities: 2.5 } });
    assert.deepEqual(constraints.all(), { equities: 2.5 });
    constraints.setTolerance("equities", null);
    assert.deepEqual(constraints.all(), {});
  });

  it("ignores a bad hand-edited value instead of failing", () => {
    const file = path.join(process.env.ALEA_DATA_DIR as string, "constraints.json");
    fs.writeFileSync(file, JSON.stringify({ tolerance: { crypto: -3, weather: "x", bogus: 1, forex: 0.01 } }));
    assert.deepEqual(constraints.all(), { forex: 0.01 });
    fs.writeFileSync(file, "not json");
    assert.deepEqual(constraints.all(), {});
    constraints.setTolerance("forex", null);
  });

  it("shows up in the domain list the UI reads", () => {
    constraints.setTolerance("crypto", 2);
    const c = describeDomains(true, constraints.all()).find((d) => d.id === "crypto")!;
    assert.equal(c.tol, 2);
    assert.equal(c.tol_default, 1.0);
    assert.equal(c.tol_custom, true);
    assert.equal(c.tol_label, "pp");
    assert.match(c.tol_text, /more than 2\.0 percentage point/);
    const fx = describeDomains(true, constraints.all()).find((d) => d.id === "forex")!;
    assert.equal(fx.tol_custom, false);
    assert.equal(fx.tol_scale, 100);
    assert.equal(fx.tol_label, "% of midpoint");
    constraints.setTolerance("crypto", null);
  });
});

describe("validation", () => {
  it("accepts values in range, including numeric strings", () => {
    assert.equal(validateTolerance("crypto", 1.5), 1.5);
    assert.equal(validateTolerance("crypto", "1.5"), 1.5);
    assert.equal(validateTolerance("defi", 0.15), 0.15);
  });

  it("rejects anything else with a plain message", () => {
    for (const bad of [0, -1, 26, NaN, Infinity, "", "abc", null, undefined, {}, [1]]) {
      assert.throws(() => validateTolerance("crypto", bad), /tolerance for crypto must be a number between 0\.01 and 25 pp/);
    }
    assert.throws(() => validateTolerance("weather", 0.01), /between 0\.1 and 25 °C/);
    assert.throws(() => validateTolerance("defi", 0.9), /between 0\.01 and 50 % of midpoint/);
    assert.throws(() => constraints.setTolerance("crypto", 999), /must be a number/);
  });
});

describe("confession and refusal under a custom tolerance", () => {
  it("records the tolerance in force and cites it", async () => {
    const held = await runCycle({ domain: "crypto", symbol: "ETH", scenario: "aligned", tolerance: 0.1, autoConfess: false });
    assert.equal(held.decision, "withheld");
    assert.equal(held.bundle.status, "conflict");
    const { confession } = await confessPending(held.cycle_id);
    assert.equal(confession.tolerance, 0.1);
    assert.equal(confession.tolerance_kind, "abs");
    assert.match(confession.narrative, /We allow 0\.1 percentage points/);
    assert.equal(confessions.get(confession.confession_id)?.tolerance, 0.1);
    assert.ok(held.trace.some((e) => e.type === "tolerance" && /this run tolerance 0\.1 \(default 1\)/.test(e.summary)));

    // The same tight tolerance conflicts again, so the rule fires and cites the confession.
    const again = await runCycle({ domain: "crypto", symbol: "ETH", scenario: "aligned", tolerance: 0.1, autoConfess: false });
    assert.equal(again.decision, "refuse");
    assert.equal(again.refusal?.rule.confession_id, confession.confession_id);

    // At the default tolerance the same data is aligned, so that conflict rule does not apply.
    const fine = await runCycle({ domain: "crypto", symbol: "ETH", scenario: "aligned", autoConfess: false });
    assert.equal(fine.decision, "stands");
  });

  it("keeps the default text unchanged when nothing is customised", async () => {
    const r = await runCycle({ domain: "weather", symbol: "London", scenario: "conflict", autoConfess: false });
    assert.equal(r.bundle.tolerance, DOMAINS.weather.tol);
    assert.ok(!r.trace.some((e) => e.type === "tolerance"));
  });
});

describe("Clear memory", () => {
  it("clears confessions and rules but keeps saved tolerances and the Zetaris export", async () => {
    const dir = process.env.ALEA_DATA_DIR as string;
    constraints.setTolerance("weather", 3);
    fs.writeFileSync(path.join(dir, "readings.csv"), "source,symbol,metric,value,captured_at\n");
    await runCycle({ domain: "crypto", symbol: "BTC", scenario: "conflict" });
    assert.ok(rules.all().length > 0);
    await resetEngine();
    assert.equal(rules.all().length, 0);
    assert.equal(confessions.all().length, 0);
    assert.deepEqual(constraints.all(), { weather: 3 });
    assert.ok(fs.existsSync(path.join(dir, "readings.csv")));
    constraints.setTolerance("weather", null);
  });
});
