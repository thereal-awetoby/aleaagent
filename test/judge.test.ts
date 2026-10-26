import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SAMPLE_MODE = "true";

const { numberCheck, metaCheck, review } = await import("../src/agents/judge.ts");
const { finalAnswer } = await import("../src/providers/nightshift.ts");

const facts = { readings: [{ source: "coingecko", value: -0.02 }, { source: "binance", value: 2.99 }, { source: "coinpaprika", value: -0.27 }], spread: 3.26, allowed_gap: 1 };
const draft = (text: string) => ({ text, model: "nvidia/nemotron-test", attempts: 1 });
const judgeSays = (json: string) => async () => ({ text: json, model: "nvidia/nemotron-judge", attempts: 1 });

describe("judge number check", () => {
  it("accepts numbers that are in the facts and small counts", () => {
    assert.deepEqual(numberCheck("We asked 3 sources. They were 3.26 points apart, more than the 1 point allowed.", facts), []);
  });

  it("flags a number that is not in the facts", () => {
    assert.equal(numberCheck("The average was 0.9%.", facts).length, 1);
  });

  it("ignores confession ids, rule ids and dates", () => {
    assert.deepEqual(numberCheck("See c_20261025_002 and R-CRYPTO-001 from 2026-10-25.", facts), []);
  });
});

describe("judge review", () => {
  it("passes a good draft", async () => {
    const r = await review({ draft: draft("The sources were 3.26 points apart."), facts, rewrite: async () => null, ask: judgeSays('{"verdict":"pass"}') });
    assert.equal(r.judge.verdict, "pass");
    assert.equal(r.text, "The sources were 3.26 points apart.");
    assert.equal(r.judge.judge_model, "nvidia/nemotron-judge");
  });

  it("sends a bad draft back once and keeps the fixed rewrite", async () => {
    let critique = "";
    const r = await review({
      draft: draft("The true value is 1.4."),
      facts,
      rewrite: async (c) => {
        critique = c;
        return draft("The sources were 3.26 points apart, so we published nothing.");
      },
      ask: judgeSays('{"verdict":"pass"}'),
    });
    assert.match(critique, /1\.4/);
    assert.equal(r.judge.verdict, "revised");
    assert.match(r.text ?? "", /3\.26/);
  });

  it("falls back to the template when the rewrite still fails", async () => {
    const r = await review({ draft: draft("ok"), facts, rewrite: async () => draft("still vague"), ask: judgeSays('{"verdict":"revise","issues":["uses jargon"]}') });
    assert.equal(r.judge.verdict, "rejected");
    assert.equal(r.text, null);
  });
});

describe("leaked model reasoning", () => {
  it("strips <think> blocks and drops an unfinished one", () => {
    assert.equal(finalAnswer("<think>plan it</think>The sources agreed."), "The sources agreed.");
    assert.equal(finalAnswer("<think>still thinking about it"), "");
  });

  it("keeps only the last <answer> when the reasoning is plain text", () => {
    const reply = "The user wants two sentences. Let me draft. <answer>draft one</answer> Better: <answer>We asked three sources.</answer>";
    assert.equal(finalAnswer(reply), "We asked three sources.");
    assert.equal(finalAnswer("Thinking... <answer>cut off mid"), "");
    assert.equal(finalAnswer("A model without tags."), "A model without tags.");
  });

  it("flags text that talks about the task instead of answering", () => {
    const leaked = "The user wants me to act as a claim agent in Alea, writing 1-2 plain English sentences. I need to use only the numbers provided.";
    assert.equal(metaCheck(leaked).length, 1);
    assert.deepEqual(metaCheck("We asked three sources and they were 3.38 points apart, so we published nothing."), []);
  });

  it("rejects a leaked draft even if the judge model says pass", async () => {
    const leaked = draft("The user wants me to act as a claim agent. Spread: 3.26.");
    const r = await review({ draft: leaked, facts, rewrite: async () => leaked, ask: judgeSays('{"verdict":"pass"}') });
    assert.equal(r.judge.verdict, "rejected");
    assert.equal(r.text, null);
  });

  it("reads the judge's final verdict, not an example quoted in its reasoning", async () => {
    const reply = 'Format is {"verdict":"pass"} or revise. The text invents a number. {"verdict":"revise","issues":["invented number"]}';
    const r = await review({ draft: draft("The sources were 3.26 points apart."), facts, rewrite: async () => null, ask: judgeSays(reply) });
    assert.equal(r.judge.verdict, "rejected");
  });
});
