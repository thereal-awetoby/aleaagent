// npm run samples: records example runs in SAMPLE_MODE into samples/, so judges can see
// inputs, outputs and the per-step log (including which model handled each step) without any keys.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SAMPLE_MODE = "true";
process.env.ALEA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-samples-data-"));
process.env.ALEA_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alea-samples-log-"));

const { ROOT } = await import("../src/config.ts");
const { runCycle, confessPending } = await import("../src/orchestrator.ts");

const dir = path.join(ROOT, "samples");
fs.mkdirSync(dir, { recursive: true });

const write = (name: string, input: unknown, output: any) => {
  const { mode, ...rest } = output;
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ input, output: rest }, null, 2) + "\n", "utf-8");
  console.log(`samples/${name}: ${output.decision ?? "confession"}`);
};

const a = { domain: "crypto", symbol: "SOL", scenario: "aligned", manual: true } as const;
write("01-aligned-claim-allowed.json", a, await runCycle({ ...a, autoConfess: false }));

const c = { domain: "weather", symbol: "Lagos", scenario: "conflict", manual: true } as const;
const held = await runCycle({ ...c, autoConfess: false });
write("02-conflict-no-claim.json", c, held);

const conf = await confessPending(held.cycle_id);
write("03-write-confession.json", { cycle_id: held.cycle_id }, conf);

write("04-same-pattern-refused.json", c, await runCycle({ ...c, autoConfess: false }));

const t = { domain: "crypto", symbol: "ETH", threshold: 5, scenario: "aligned" } as const;
write("05-threshold-claim-false-confessed.json", t, await runCycle({ ...t }));

fs.writeFileSync(
  path.join(dir, "README.md"),
  `# Sample runs

Recorded with \`npm run samples\` in SAMPLE_MODE (fixtures, template prose, no keys).
Each file has the request (\`input\`) and the full result (\`output\`), including \`trace\`:
one entry per agent step with \`from\`, \`to\`, \`type\`, \`summary\` and \`model\`
(\`template\` when no language model was used, \`none\` for non-LLM steps; in live mode the
Nightshift model id that answered).

| File | What happens |
|---|---|
| 01-aligned-claim-allowed.json | Three crypto sources agree; the claim is allowed |
| 02-conflict-no-claim.json | Weather sources disagree; no claim is made |
| 03-write-confession.json | The confession and rule R-WX-001 are written to H-MEM |
| 04-same-pattern-refused.json | Same request again; refused, citing the confession |
| 05-threshold-claim-false-confessed.json | Aligned sources, but the claimed threshold is false; confessed |
`,
  "utf-8",
);
