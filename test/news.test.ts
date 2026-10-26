import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-log-"));

const { runCycle, confessPending } = await import("../src/orchestrator.ts");
const { getEngine } = await import("../src/engine.ts");
const { DOMAINS, describeDomains, domainOfSymbol, fmtValue } = await import("../src/domains.ts");
const { aggregate } = await import("../src/agents/aggregator.ts");
const { readSource } = await import("../src/providers/sources.ts");
const { rationaleTemplate } = await import("../src/sample/templates.ts");

describe("news domain pack", () => {
  before(async () => {
    await getEngine();
  });

  it("is registered with R-NEWS rules, five events and an exact-match tolerance", () => {
    const d = DOMAINS.news;
    assert.equal(d.rulePrefix, "R-NEWS");
    assert.equal(d.symbols.length, 5);
    assert.equal(d.tol, 0);
    assert.equal(domainOfSymbol("event-etf"), "news");
    assert.ok(describeDomains(true).some((x) => x.id === "news"));
  });

  it("shows statuses as words, not numbers", () => {
    assert.equal(fmtValue("status", 2), "confirmed");
    assert.equal(fmtValue("status", 1), "unconfirmed");
    assert.equal(fmtValue("status", 0), "denied");
  });

  it("every event has aligned and conflict fixtures; any mismatch is a conflict", async () => {
    for (const s of DOMAINS.news.symbols) {
      assert.equal((await aggregate("news", s, "aligned")).status, "aligned", `${s} aligned`);
      assert.equal((await aggregate("news", s, "conflict")).status, "conflict", `${s} conflict`);
    }
  });

  it("explains a disagreement in plain words", async () => {
    const b = await aggregate("news", "event-fed-rate", "conflict");
    const text = rationaleTemplate(b, null);
    assert.match(text, /the Fed cut interest rates/);
    assert.match(text, /different answers/);
    assert.match(text, /unconfirmed/);
  });

  it("live mode is honest: news sources report 'not connected'", async () => {
    const r = await readSource("news", "event-etf", "wire-a");
    assert.equal(r.value, null);
    assert.equal(r.error, "not connected");
  });

  it("runs the full loop: allowed, withheld, confessed, then refused with a citation", async () => {
    const ok = await runCycle({ domain: "news", symbol: "event-halving", scenario: "aligned", autoConfess: false });
    assert.equal(ok.decision, "stands");
    assert.match(ok.claim!.text, /is confirmed across sources/);
    const held = await runCycle({ domain: "news", symbol: "event-halving", scenario: "conflict", autoConfess: false });
    assert.equal(held.decision, "withheld");
    const done = await confessPending(held.cycle_id);
    assert.ok(done.rule.rule_id.startsWith("R-NEWS"));
    assert.match(done.confession.narrative, /^We asked 3 sources whether the next Bitcoin halving/);
    const again = await runCycle({ domain: "news", symbol: "event-halving", scenario: "conflict", autoConfess: false });
    assert.equal(again.decision, "refuse");
    assert.equal(again.refusal!.rule.confession_id, done.confession.confession_id);
  });
});
