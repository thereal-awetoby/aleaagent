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

describe("judge cost", () => {
  it("does not call the model judge when the code checks already failed", async () => {
    let calls = 0;
    const ask = async () => { calls++; return { text: '{"verdict":"pass"}', model: "nvidia/nemotron-judge", attempts: 1 }; };
    const r = await review({ draft: draft("The true value is 9.9."), facts, rewrite: async () => draft("The sources were 3.26 points apart."), ask });
    assert.equal(r.judge.verdict, "revised");
    assert.equal(calls, 1, "only the rewrite is sent to the model judge");
  });

  it("passes thinking on only when METERLESS_JUDGE_THINKING is true", async () => {
    const { config } = await import("../src/config.ts");
    const prev = config.nightshift.judgeThinking;
    const seen: Array<boolean | undefined> = [];
    const ask = async (_s: string, _u: string, _m?: string, opts?: { enableThinking?: boolean }) => {
      seen.push(opts?.enableThinking);
      return { text: '{"verdict":"pass"}', model: "nvidia/nemotron-judge", attempts: 1 };
    };
    try {
      config.nightshift.judgeThinking = false;
      await review({ draft: draft("The sources were 3.26 points apart."), facts, rewrite: async () => null, ask });
      config.nightshift.judgeThinking = true;
      await review({ draft: draft("The sources were 3.26 points apart."), facts, rewrite: async () => null, ask });
    } finally {
      config.nightshift.judgeThinking = prev;
    }
    assert.deepEqual(seen, [false, true]);
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

describe("plain-English rules for live prose", async () => {
  const { plainFacts, confessionChecks, rationaleChecks } = await import("../src/agents/facts.ts");
  const bundle: any = {
    domain: "weather", symbol: "Singapore", label: "temperature", metric: "temperature", status: "partial", spread: 0.4, consensus: 30.1,
    tolerance: 2, tolerance_kind: "abs",
    readings: [{ source: "open-meteo", value: 30.0 }, { source: "wttr.in", value: 30.4 }, { source: "openweather", value: null, error: "no key" }],
  };

  it("gives Nemotron the subject, readings and allowed gap in plain words", () => {
    const f = plainFacts(bundle);
    assert.equal(f.what_was_checked, "the temperature in Singapore");
    assert.equal(f.allowed_gap, "2.0 °C");
    assert.deepEqual(f.sources_that_did_not_answer, ["openweather"]);
    assert.match(f.sources_reported[2].reported, /did not answer/);
  });

  it("a confession must not open with the rule id and must promise to refuse next time", () => {
    const check = confessionChecks(bundle, "R-WX-001");
    assert.ok(check("R-WX-001: sources were partial.").length >= 2);
    const good = "We asked three sources for the temperature in Singapore, but openweather did not answer. With only two answers we could not cross-check, so we made no claim. We saved a rule (R-WX-001): next time this happens, Alea will refuse and point back to this confession.";
    assert.deepEqual(check(good), []);
  });

  it("a rationale must name the source that did not answer", () => {
    assert.equal(rationaleChecks(bundle)("Two sources agreed on the temperature in Singapore.").length, 1);
  });
});
