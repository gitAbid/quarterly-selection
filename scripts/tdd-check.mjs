import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
const [phase, label, ...files] = process.argv.slice(2);
if (!["red", "green", "regression"].includes(phase) || !label || !files.length)
  throw new Error("usage: tdd-check.mjs red|green|regression label test-files...");
mkdirSync("evidence/tdd", { recursive: true });
const command = ["./node_modules/vitest/vitest.mjs", "run", ...files];
const r = spawnSync(process.execPath, command, { encoding: "utf8" });
const log = (r.stdout ?? "") + (r.stderr ?? "");
writeFileSync(`evidence/tdd/${label}-${phase}.log`, log);
appendFileSync(
  "evidence/tdd.jsonl",
  JSON.stringify({
    phase,
    label,
    runtime: process.version,
    at: new Date().toISOString(),
    command: [process.execPath, ...command],
    exitCode: r.status,
    log: `evidence/tdd/${label}-${phase}.log`,
  }) + "\n",
);
process.stdout.write(log);
if ((phase === "red" && r.status === 0) || (phase !== "red" && r.status !== 0) || r.error) process.exit(1);
