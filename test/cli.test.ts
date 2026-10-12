import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { input, key, setup } from "./helpers";
const cli = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
const run = (args: string[], seedKey: string | null = key.toString("base64")) => {
  const env = { ...process.env };
  if (seedKey === null) delete env.FLEETCHECK_SEED_KEY;
  else env.FLEETCHECK_SEED_KEY = seedKey;
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
};
it("draws, reopens, reads, exports and verifies from independent CLI processes", () => {
  const { path, dir } = setup(),
    file = join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input));
  const first = run(["draw", "--db", path, "--input", file]);
  expect(first.status).toBe(0);
  const a = JSON.parse(first.stdout);
  expect(a.reused).toBe(false);
  expect(first.stdout + first.stderr).not.toContain(key.toString("base64"));
  expect(first.stdout).not.toContain("revealedSeed");
  const second = run(["draw", "--db", path, "--input", file]);
  expect(second.status).toBe(0);
  expect(JSON.parse(second.stdout)).toEqual({ ...a, reused: true });
  const lookup = run([
    "get",
    "--db",
    path,
    "--company",
    input.companyId,
    "--quarter",
    input.quarter,
  ]);
  expect(lookup.status).toBe(0);
  expect(JSON.parse(lookup.stdout)).toEqual(a.record);
  const audit = run([
    "audit",
    "--db",
    path,
    "--company",
    input.companyId,
    "--quarter",
    input.quarter,
  ]);
  expect(audit.status).toBe(0);
  const bundlePath = join(dir, "audit.json");
  writeFileSync(bundlePath, audit.stdout);
  const verified = run(["verify", bundlePath]);
  expect(verified.status).toBe(0);
  expect(JSON.parse(verified.stdout).ok).toBe(true);
});
it("reports usage and unreadable/invalid JSON with exit code 2", () => {
  const { dir } = setup(),
    bad = join(dir, "bad.json");
  writeFileSync(bad, "{broken");
  for (const args of [
    [],
    ["unknown"],
    ["verify"],
    ["verify", join(dir, "absent.json")],
    ["verify", bad],
    ["draw", "--db"],
    ["draw", "--db", "x", "--input", "x", "--extra", "x"],
  ]) {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(key.toString("base64"));
  }
});
it("rejects invalid draw inputs before creating storage and without exposing the seed key", () => {
  const { path, dir } = setup(),
    file = join(dir, "invalid.json");
  writeFileSync(file, JSON.stringify({ ...input, percentage: 0 }));
  const result = run(["draw", "--db", path, "--input", file]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain(key.toString("base64"));
  expect(existsSync(path)).toBe(false);
});
it.each([null, "not-base64", Buffer.alloc(31).toString("base64")])(
  "fails on missing or malformed environment key %#",
  (seedKey) => {
    const { path, dir } = setup(),
      file = join(dir, "input.json");
    writeFileSync(file, JSON.stringify(input));
    const result = run(["draw", "--db", path, "--input", file], seedKey);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(existsSync(path)).toBe(false);
  },
);
it("returns exit 1 for invalid evidence including JSON null and unknown versions", () => {
  const { dir } = setup(),
    file = join(dir, "audit.json");
  for (const value of [
    null,
    {},
    {
      record: { algorithmVersion: "unknown" },
      revealedSeed: "x",
      algorithm: "x",
    },
  ]) {
    writeFileSync(file, JSON.stringify(value));
    const result = run(["verify", file], null);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(result.stderr).toBe("");
  }
});
it("fails unknown audit runs, wrong export keys and invalid database paths without false success", () => {
  const { path, dir } = setup(),
    file = join(dir, "input.json");
  writeFileSync(file, JSON.stringify(input));
  const missing = run(["audit", "--db", path, "--company", "missing", "--quarter", input.quarter]);
  expect(missing.status).toBe(1);
  expect(missing.stdout).toBe("");
  expect(run(["draw", "--db", path, "--input", file]).status).toBe(0);
  const wrong = run(
    ["audit", "--db", path, "--company", input.companyId, "--quarter", input.quarter],
    Buffer.alloc(32, 8).toString("base64"),
  );
  expect(wrong.status).toBe(1);
  expect(wrong.stdout).toBe("");
  expect(wrong.stderr).not.toContain(key.toString("base64"));
  const failed = run(["draw", "--db", join(dir, "missing", "draw.sqlite"), "--input", file]);
  expect(failed.status).toBe(1);
  expect(failed.stdout).toBe("");
  expect(
    run(["get", "--db", path, "--company", input.companyId, "--quarter", input.quarter]).status,
  ).toBe(0);
});
it("rejects duplicate flags and returns JSON null for a valid missing lookup", () => {
  const { path } = setup();
  expect(run(["get", "--db", path, "--db", path, "--quarter", input.quarter]).status).toBe(2);
  const result = run(["get", "--db", path, "--company", "missing", "--quarter", input.quarter]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toBeNull();
});
