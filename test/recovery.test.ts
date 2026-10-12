import { writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { SelectionStorageError, verifyAuditBundle } from "../src/index";
import { input, open, setup } from "./helpers";
import { message, start, stop } from "./process-helpers";
it("returns one winner across ten independent processes with matching inputs", async () => {
  const { path } = setup();
  await open(path).close();
  const workers = await Promise.all(
    Array.from({ length: 10 }, () => start("draw", path)),
  );
  const waiting = workers.map((w) => message(w, "result"));
  workers.forEach((w) => w.send(input));
  const results = (await Promise.all(waiting)).map((v) => v.result);
  expect(results.filter((v) => !v.reused)).toHaveLength(1);
  for (const outcome of results) {
    expect(outcome.record).toEqual(results[0]?.record);
    expect(outcome.inputsMatch).toBe(true);
  }
  expect(
    verifyAuditBundle(
      await open(path).exportAudit(input.companyId, input.quarter),
    ).ok,
  ).toBe(true);
});
it("returns the committed winner for concurrent conflicting populations and percentages", async () => {
  const { path } = setup();
  await open(path).close();
  const workers = await Promise.all(
    Array.from({ length: 10 }, () => start("draw", path)),
  );
  const requests = workers.map((_w, i) => ({
    ...input,
    percentage: i % 2 ? 50 : 25,
    vehicleIds: [...input.vehicleIds, `extra-${i}`],
  }));
  const waiting = workers.map((w) => message(w, "result"));
  workers.forEach((w, i) => w.send(requests[i]!));
  const results = (await Promise.all(waiting)).map((v) => v.result),
    winner = results.findIndex((v) => !v.reused);
  expect(results.filter((v) => !v.reused)).toHaveLength(1);
  for (const [i, outcome] of results.entries()) {
    expect(outcome.record).toEqual(results[winner]?.record);
    expect(outcome.inputsMatch).toBe(i === winner);
  }
});
it("survives termination after a child process reports committed success", async () => {
  const { path } = setup(),
    child = await start("draw", path),
    waiting = message(child, "result");
  child.send(input);
  const first = (await waiting).result;
  await stop(child, "SIGKILL");
  const service = open(path);
  expect((await service.createOrGet(input)).record).toEqual(first.record);
  expect(
    verifyAuditBundle(await service.exportAudit(input.companyId, input.quarter))
      .ok,
  ).toBe(true);
});
it("recovers after terminating a real draw before its success response", async () => {
  const { path } = setup(),
    child = await start("draw", path);
  const large = {
    ...input,
    vehicleIds: Array.from({ length: 200_000 }, (_, i) => `vehicle-${i}`),
  };
  const waiting = message(child, "starting");
  child.send(large);
  await waiting;
  await stop(child, "SIGKILL");
  const service = open(path),
    prior = await service.get(input.companyId, input.quarter),
    recovered = await service.createOrGet(large);
  if (prior) expect(recovered.record).toEqual(prior);
  else expect(recovered.reused).toBe(false);
  expect(recovered.record.selected).toHaveLength(50_000);
  expect(
    verifyAuditBundle(await service.exportAudit(input.companyId, input.quarter))
      .ok,
  ).toBe(true);
});
it("waits safely for external write contention that clears before five seconds", async () => {
  const { path } = setup(),
    service = open(path),
    holder = await start("lock", path, 350);
  const result = await service.createOrGet(input);
  expect(result.record.selectedCount).toBe(5);
  await stop(holder);
});
it("rolls back an open child-process write transaction after SIGKILL", async () => {
  const { path } = setup(),
    service = open(path),
    first = await service.createOrGet(input);
  await service.close();
  const child = await start("uncommitted", path); // ready is emitted after both writes.
  await stop(child, "SIGKILL");
  const reopened = open(path);
  expect(await reopened.get(input.companyId, input.quarter)).toEqual(
    first.record,
  );
  expect(await reopened.get(input.companyId, "2027-Q1")).toBeUndefined();
  expect(
    (await reopened.createOrGet({ ...input, quarter: "2027-Q1" })).reused,
  ).toBe(false);
  expect(
    verifyAuditBundle(await reopened.exportAudit(input.companyId, "2027-Q1"))
      .ok,
  ).toBe(true);
});
it("times out under prolonged contention without false success and allows a safe retry", async () => {
  const { path } = setup(),
    service = open(path),
    holder = await start("lock", path, 12_000);
  const before = performance.now();
  let failure: unknown;
  try {
    await service.createOrGet(input);
  } catch (e) {
    failure = e;
  }
  expect(failure).toBeInstanceOf(SelectionStorageError);
  expect((failure as SelectionStorageError).retryable).toBe(true);
  expect(performance.now() - before).toBeGreaterThan(4500);
  expect(await service.get(input.companyId, input.quarter)).toBeUndefined();
  await stop(holder);
  expect((await service.createOrGet(input)).reused).toBe(false);
});
it("rolls back failed inserts and preserves earlier evidence, without exposing trigger details", async () => {
  const { path } = setup(),
    service = open(path),
    first = await service.createOrGet(input),
    db = new Database(path);
  db.exec(
    "CREATE TRIGGER reject_write BEFORE INSERT ON selection_runs BEGIN SELECT RAISE(ABORT,'private-database-error'); END",
  );
  await expect(
    service.createOrGet({ ...input, quarter: "2027-Q1" }),
  ).rejects.toThrow("selection storage operation failed");
  expect(await service.get(input.companyId, input.quarter)).toEqual(
    first.record,
  );
  expect(await service.get(input.companyId, "2027-Q1")).toBeUndefined();
  db.exec("DROP TRIGGER reject_write");
  db.close();
  expect(
    (await service.createOrGet({ ...input, quarter: "2027-Q1" })).reused,
  ).toBe(false);
});
it("rejects corrupt storage and future schema versions rather than starting a fallback store", async () => {
  const { path } = setup();
  writeFileSync(path, "not-a-sqlite-database");
  expect(() => open(path)).toThrow(SelectionStorageError);
  const second = setup(),
    db = new Database(second.path);
  db.pragma("user_version = 999");
  db.close();
  expect(() => open(second.path)).toThrow(SelectionStorageError);
});
