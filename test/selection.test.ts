import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  replaySelection,
  SelectionInputError,
  type DrawInput,
} from "../src/index";
import { commitSeed } from "../src/domain/selection";
const seed = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const fixture: DrawInput = {
  companyId: "co-1",
  quarter: "2026-Q4",
  percentage: 50,
  vehicleIds: ["veh-a", "veh-b", "veh-c", "veh-d"],
};
const ids = (n: number) => Array.from({ length: n }, (_, i) => `vehicle-${i}`);

describe("selection and replay boundary", () => {
  it("reproduces the independently calculated v2 result", () => {
    expect(replaySelection(fixture, seed)).toEqual({
      algorithmVersion: "v2",
      companyId: "co-1",
      quarter: "2026-Q4",
      percentageBp: 5000,
      eligibleCount: 4,
      selectedCount: 2,
      snapshotSha256:
        "2ca026c39676f7ed99991435a8bce55e089452390cf8d27b81a0cb6870146a20",
      selected: [
        {
          vehicleId: "veh-c",
          rank: 1,
          score:
            "30bbe88e5ac582976a74c9489f3b5121d4999e7bb4eec18f10395f1f137b814d",
        },
        {
          vehicleId: "veh-b",
          rank: 2,
          score:
            "93bc42ecaea91a3cb92afdba64829727207b479f56afb884b43af30ac14a2dda",
        },
      ],
    });
  });
  it("commits to the fixture seed with the independently calculated hash", () => {
    expect(commitSeed(seed, "v2")).toBe(
      "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd",
    );
  });
});
it("rejects zero percent rather than issuing an empty positive-policy draw", () => {
  expect(() => replaySelection({ ...fixture, percentage: 0 }, seed)).toThrow(
    SelectionInputError,
  );
});
it.each([0, -1, 100.01, NaN, Infinity, 0.001, 1e-12, 12.345, "25"])(
  "rejects unsupported percentage %s",
  (value) => {
    expect(() =>
      replaySelection({ ...fixture, percentage: value as number }, seed),
    ).toThrow(SelectionInputError);
  },
);
it.each([
  [20, 25, 5],
  [7, 25, 2],
  [20, 1, 1],
  [1, 0.01, 1],
  [0, 25, 0],
  [37, 100, 37],
  [10_000, 0.07, 7],
  [200_000, 12.5, 25_000],
])("selects %i vehicles at %s percent with count %i", (n, p, count) => {
  expect(
    replaySelection({ ...fixture, vehicleIds: ids(n), percentage: p }, seed)
      .selectedCount,
  ).toBe(count);
});
it.each([
  null,
  {},
  { ...fixture, companyId: 1 },
  { ...fixture, companyId: "  " },
  { ...fixture, quarter: "2026-Q5" },
  { ...fixture, quarter: "0000-Q1" },
  { ...fixture, quarter: 2026 },
  { ...fixture, vehicleIds: "vehicles" },
  { ...fixture, vehicleIds: ["a", "a"] },
  { ...fixture, vehicleIds: [""] },
  { ...fixture, vehicleIds: ["  "] },
  { ...fixture, vehicleIds: [1] },
  { ...fixture, vehicleIds: ["\ud800", "\ud801"] },
  { ...fixture, companyId: "\udfff" },
  { ...fixture, seed: "steer" },
  { ...fixture, seedHex: "steer" },
])("rejects invalid public input %# without leaking its content", (input) => {
  expect(() => replaySelection(input as DrawInput, seed)).toThrow(
    SelectionInputError,
  );
});
it.each(["", "not-hex", "ab", "f".repeat(65), 17])(
  "rejects malformed v2 seed %#",
  (value) => {
    expect(() => replaySelection(fixture, value as string)).toThrow(
      SelectionInputError,
    );
  },
);
it("rejects unsupported versions explicitly", () => {
  expect(() => replaySelection(fixture, seed, "v999" as "v2")).toThrow(
    SelectionInputError,
  );
});
it("replays the independent legacy v1 fixture with its original UTF-8 seed contract", async () => {
  const { default: bundle } = await import("./fixtures/v1-bundle.json");
  const { commitment, eligibleVehicleIds, createdAt, ...result } =
    bundle.record;
  expect(replaySelection(fixture, bundle.revealedSeed, "v1")).toEqual(result);
});
it("preserves valid Unicode, delimiters, case and caller-owned array order", () => {
  const population = ["a|b", 'a"b', "é", "e\u0301", "🚚", "A", "a"];
  const before = [...population];
  const a = replaySelection(
    { ...fixture, vehicleIds: population, percentage: 100 },
    seed,
  );
  expect(new Set(a.selected.map((s) => s.vehicleId))).toEqual(
    new Set(population),
  );
  expect(population).toEqual(before);
  expect(
    replaySelection(
      { ...fixture, vehicleIds: [...population].reverse(), percentage: 100 },
      seed,
    ),
  ).toEqual(a);
});
it("does not exclude a previous-quarter selection", () => {
  const prior = replaySelection({ ...fixture, quarter: "2026-Q3" }, seed);
  const current = new Set(
    replaySelection({ ...fixture, percentage: 100 }, seed).selected.map(
      (s) => s.vehicleId,
    ),
  );
  expect(prior.selected.every((s) => current.has(s.vehicleId))).toBe(true);
});
it("gives no gross advantage across 4000 fixed independent seeds", () => {
  const population = ids(20),
    counts = new Map(population.map((id) => [id, 0]));
  for (let i = 0; i < 4000; i++) {
    const trial = createHash("sha256")
      .update(`distribution:${i}`)
      .digest("hex");
    const r = replaySelection(
      { ...fixture, vehicleIds: population, percentage: 25 },
      trial,
    );
    for (const v of r.selected)
      counts.set(v.vehicleId, counts.get(v.vehicleId)! + 1);
  }
  for (const count of counts.values())
    expect(Math.abs(count - 1000)).toBeLessThan(
      5 * Math.sqrt(4000 * 0.25 * 0.75),
    );
});
it.each(["0001-Q1", "9999-Q4", "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"])(
  "accepts calendar quarter %s",
  (quarter) => {
    expect(replaySelection({ ...fixture, quarter }, seed).quarter).toBe(
      quarter,
    );
  },
);
it.each(["2026Q4", "26-Q4", "2026-q4", ""])(
  "rejects malformed calendar quarter %s",
  (quarter) => {
    expect(() => replaySelection({ ...fixture, quarter }, seed)).toThrow(
      SelectionInputError,
    );
  },
);
it("rejects sparse populations instead of selecting undefined vehicles", () => {
  expect(() =>
    replaySelection(
      { ...fixture, vehicleIds: new Array(1), percentage: 100 },
      seed,
    ),
  ).toThrow(SelectionInputError);
});
it("rejects extra decimal digits even when close to a hundredth", () => {
  expect(() =>
    replaySelection({ ...fixture, percentage: 12.340000000001 }, seed),
  ).toThrow(SelectionInputError);
});
