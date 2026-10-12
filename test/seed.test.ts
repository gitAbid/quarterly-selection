import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { verifyAuditBundle, type SelectionRunRecord } from "../src/index";
import { input, key, open, setup } from "./helpers";
it("exports the retained seed explicitly, including after reopen, without plaintext persistence", async () => {
  const { path } = setup(),
    service = open(path),
    outcome = await service.createOrGet(input);
  const bundle = await service.exportAudit(input.companyId, input.quarter);
  expect(bundle.revealedSeed).toMatch(/^[0-9a-f]{64}$/);
  expect(createHash("sha256").update(Buffer.from(bundle.revealedSeed, "hex")).digest("hex")).toBe(
    outcome.record.commitment,
  );
  expect(bundle.record).toEqual(outcome.record);
  expect(verifyAuditBundle(bundle).ok).toBe(true);
  await service.close();
  expect(await open(path).exportAudit(input.companyId, input.quarter)).toEqual(bundle);
  for (const name of [path, path + "-wal", path + "-shm"]) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(name);
    } catch {
      continue;
    }
    expect(bytes.includes(Buffer.from(bundle.revealedSeed))).toBe(false);
    expect(bytes.includes(Buffer.from(bundle.revealedSeed, "hex"))).toBe(false);
    expect(bytes.includes(key)).toBe(false);
  }
});
it("rejects malformed persisted records instead of returning a successful draw", async () => {
  const { path } = setup(),
    service = open(path),
    original = await service.createOrGet(input);
  const db = new Database(path);
  db.prepare("UPDATE selection_runs SET public_record=?").run(
    JSON.stringify({
      companyId: input.companyId,
      quarter: input.quarter,
      algorithmVersion: "v2",
    }),
  );
  db.close();
  await expect(service.get(input.companyId, input.quarter)).rejects.toThrow();
  await expect(service.createOrGet(input)).rejects.toThrow();
  expect(original.record.selectedCount).toBe(5);
});
it("fails with a wrong key on read/retry/export and never replaces the original", async () => {
  const { path } = setup(),
    service = open(path),
    original = await service.createOrGet(input);
  const wrong = open(path, Buffer.alloc(32, 8));
  await expect(wrong.exportAudit(input.companyId, input.quarter)).rejects.toThrow(/authenticated/);
  await expect(wrong.createOrGet(input)).rejects.toThrow(/authenticated/);
  await expect(wrong.get(input.companyId, input.quarter)).rejects.toThrow(/authenticated/);
  expect(await service.get(input.companyId, input.quarter)).toEqual(original.record);
});
it.each(["seed_ciphertext", "seed_nonce", "seed_tag"])(
  "rejects damaged %s without returning a replacement draw",
  async (column) => {
    const { path } = setup(),
      service = open(path);
    const original = await service.createOrGet(input);
    const db = new Database(path);
    const row = db.prepare(`SELECT ${column} AS value FROM selection_runs`).get() as {
      value: Buffer;
    };
    const damaged = Buffer.from(row.value);
    damaged[0] = damaged[0]! ^ 1;
    db.prepare(`UPDATE selection_runs SET ${column}=?`).run(damaged);
    await expect(service.exportAudit(input.companyId, input.quarter)).rejects.toThrow(/authenticated/);
    await expect(service.createOrGet(input)).rejects.toThrow(/authenticated/);
    db.prepare(`UPDATE selection_runs SET ${column}=?`).run(row.value);
    db.close();
    expect(await service.get(input.companyId, input.quarter)).toEqual(original.record);
  },
);
it("authenticates run identity against ciphertext copied from another company", async () => {
  const { path } = setup(),
    service = open(path);
  await service.createOrGet(input);
  await service.createOrGet({ ...input, companyId: "co-2" });
  const db = new Database(path);
  const source = db
    .prepare("SELECT seed_ciphertext,seed_nonce,seed_tag FROM selection_runs WHERE company_id=?")
    .get("co-1") as {
    seed_ciphertext: Buffer;
    seed_nonce: Buffer;
    seed_tag: Buffer;
  };
  db.prepare("UPDATE selection_runs SET seed_ciphertext=?,seed_nonce=?,seed_tag=? WHERE company_id=?").run(
    source.seed_ciphertext,
    source.seed_nonce,
    source.seed_tag,
    "co-2",
  );
  db.close();
  await expect(service.exportAudit("co-2", input.quarter)).rejects.toThrow(/authenticated/);
  expect(await service.get("co-1", input.quarter)).toBeDefined();
});
it("rejects inconsistent selected evidence on read as well as export", async () => {
  const { path } = setup(),
    service = open(path);
  const { record } = await service.createOrGet(input);
  record.selected[0]!.vehicleId = "not-eligible";
  const db = new Database(path);
  db.prepare("UPDATE selection_runs SET public_record=?").run(JSON.stringify(record));
  db.close();
  await expect(service.get(input.companyId, input.quarter)).rejects.toThrow(/inconsistent/);
  await expect(service.exportAudit(input.companyId, input.quarter)).rejects.toThrow(/inconsistent/);
});
it("exports detached evidence and reports an unknown run clearly", async () => {
  const { path } = setup(),
    service = open(path);
  await service.createOrGet(input);
  const first = await service.exportAudit(input.companyId, input.quarter),
    copy = structuredClone(first);
  first.record.selected.length = 0;
  first.record.eligibleVehicleIds.length = 0;
  expect(await service.exportAudit(input.companyId, input.quarter)).toEqual(copy);
  await expect(service.exportAudit("missing", input.quarter)).rejects.toThrow(/no selection exists/);
});
it("does not mutate or retain the caller-owned key buffer", async () => {
  const { path } = setup(),
    callerKey = Buffer.from(key),
    service = open(path, callerKey);
  await service.createOrGet(input);
  callerKey.fill(0);
  expect(verifyAuditBundle(await service.exportAudit(input.companyId, input.quarter)).ok).toBe(true);
  await service.close();
  expect(key).toEqual(Buffer.alloc(32, 7));
});
