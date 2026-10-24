import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-log-"));

const { runCycle } = await import("../src/orchestrator.ts");
const { classify } = await import("../src/agents/aggregator.ts");
const { getEngine } = await import("../src/engine.ts");

describe("classify", () => {
  it("labels aligned, conflict and partial bundles", () => {
    const r = (v: number | null) => ({ source: "s", value: v });
    assert.equal(classify([r(5.4), r(5.5), r(5.3)], 1, 3).status, "aligned");
    assert.equal(classify([r(5.8), r(4.1), r(6.2)], 1, 3).status, "conflict");
    assert.equal(classify([r(5.4), r(null), r(5.3)], 1, 3).status, "partial");
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

  it("confesses on source conflict and emits R-001", async () => {
    const r = await runCycle({ symbol: "BTC", threshold: 5, scenario: "conflict" });
    assert.equal(r.decision, "confess");
    assert.equal(r.confession?.error_type, "source_conflict");
    assert.equal(r.rule?.rule_id, "R-001");
    firstId = r.confession!.confession_id;
  });

  it("refuses the same pattern and cites the confession", async () => {
    const r = await runCycle({ symbol: "BTC", threshold: 5, scenario: "conflict" });
    assert.equal(r.decision, "refuse");
    assert.equal(r.refusal?.rule.confession_id, firstId);
    assert.ok(r.refusal!.recall.hits.length > 0, "H-MEM should recall the confession");
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
