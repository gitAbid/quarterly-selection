import { expect, it } from "vitest";
import { input, open, setup } from "./helpers";
it("creates a committed draw retrievable through the public service", async () => {
  const { path } = setup(),
    service = open(path);
  const outcome = await service.createOrGet(input);
  expect(outcome.reused).toBe(false);
  expect(outcome.inputsMatch).toBe(true);
  expect(outcome.record.selectedCount).toBe(5);
  expect(outcome.record.selected).toHaveLength(5);
  expect(outcome.record.algorithmVersion).toBe("v2");
  expect(await service.get(input.companyId, input.quarter)).toEqual(
    outcome.record,
  );
  expect(outcome.record.commitment).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(outcome)).not.toMatch(
    /seedHex|revealedSeed|ciphertext|encryptionKey/,
  );
});
it("reuses the original even after population/percentage changes and reopening", async () => {
  const { path } = setup(),
    first = open(path),
    a = await first.createOrGet(input);
  await first.close();
  const second = open(path);
  const same = await second.createOrGet({
    ...input,
    vehicleIds: [...input.vehicleIds].reverse(),
  });
  expect(same).toEqual({ record: a.record, reused: true, inputsMatch: true });
  const changed = await second.createOrGet({
    ...input,
    percentage: 50,
    vehicleIds: [...input.vehicleIds, "new"],
  });
  expect(changed).toEqual({
    record: a.record,
    reused: true,
    inputsMatch: false,
  });
  expect(await second.get(input.companyId, input.quarter)).toEqual(a.record);
});
it("detaches all public records and does not mutate the caller array", async () => {
  const { path } = setup(),
    service = open(path),
    population = [...input.vehicleIds],
    request = { ...input, vehicleIds: population };
  const a = await service.createOrGet(request);
  expect(population).toEqual(input.vehicleIds);
  const original = structuredClone(a.record);
  a.record.selected[0]!.vehicleId = "outside-fleet";
  a.record.eligibleVehicleIds.length = 0;
  population.push("caller-mutated");
  expect(await service.get(input.companyId, input.quarter)).toEqual(original);
  const fetched = (await service.get(input.companyId, input.quarter))!;
  fetched.selected.length = 0;
  expect((await service.createOrGet(input)).record).toEqual(original);
});
it("rejects invalid retries without changing an existing record", async () => {
  const { path } = setup(),
    service = open(path),
    a = await service.createOrGet(input);
  for (const invalid of [
    { ...input, percentage: 0 },
    { ...input, vehicleIds: ["x", "x"] },
    { ...input, seed: "steer" },
  ]) {
    await expect(service.createOrGet(invalid)).rejects.toThrow();
    expect(await service.get(input.companyId, input.quarter)).toEqual(a.record);
  }
});
it("uses distinct durable identities and an injected clock", async () => {
  const { path } = setup(),
    service = open(path, undefined, () => new Date("2026-10-01T00:00:00Z"));
  const first = await service.createOrGet(input);
  expect(first.record.createdAt).toBe("2026-10-01T00:00:00.000Z");
  expect(
    (await service.createOrGet({ ...input, companyId: "co-2" })).reused,
  ).toBe(false);
  expect(
    (await service.createOrGet({ ...input, quarter: "2027-Q1" })).reused,
  ).toBe(false);
  expect(await service.get("missing", "2026-Q4")).toBeUndefined();
});
it("has no success or in-memory fallback after storage errors", async () => {
  const { path } = setup(),
    service = open(path),
    a = await service.createOrGet(input);
  await service.close();
  await expect(
    service.createOrGet({ ...input, quarter: "2027-Q1" }),
  ).rejects.toThrow(/closed/);
  expect(await open(path).get(input.companyId, input.quarter)).toEqual(
    a.record,
  );
  expect(() => open(path + "/missing/child.sqlite")).toThrow(/storage/);
});
it.each([
  new Uint8Array(0),
  new Uint8Array(31),
  new Uint8Array(33),
  null,
  "not-a-key",
])("rejects invalid key configuration %#", (value) => {
  const { path } = setup();
  expect(() => open(path, value as Uint8Array)).toThrow(/32 bytes/);
});
it("rejects invalid lookup identity and clock without committing", async () => {
  const { path } = setup(),
    service = open(path, undefined, () => new Date(NaN));
  await expect(service.get("", "2026-Q4")).rejects.toThrow();
  await expect(service.createOrGet(input)).rejects.toThrow(/clock/);
  expect(await service.get(input.companyId, input.quarter)).toBeUndefined();
});
