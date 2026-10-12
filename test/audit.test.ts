import { expect, it } from "vitest";
import { verifyAuditBundle } from "../src/index";
import legacy from "./fixtures/v1-bundle.json";
it("accepts the independently generated v1 audit fixture", () => {
  const report = verifyAuditBundle(legacy);
  expect(report.ok).toBe(true);
  expect(report.errors).toEqual([]);
});
it("returns a failed report for malformed external JSON instead of throwing", () => {
  expect(verifyAuditBundle(null).ok).toBe(false);
});
it.each([
  undefined,
  17,
  "text",
  [],
  {},
  { record: null },
  { ...legacy, revealedSeed: 17 },
  { ...legacy, algorithm: null },
])("rejects malformed envelope %# with a structured report", (value) => {
  const report = verifyAuditBundle(value);
  expect(report.ok).toBe(false);
  expect(report.errors.length).toBeGreaterThan(0);
});
const edits: Array<[string, (bundle: typeof legacy) => void]> = [
  [
    "unknown version",
    (b) => {
      b.record.algorithmVersion = "v999";
    },
  ],
  [
    "company",
    (b) => {
      b.record.companyId = "another-company";
    },
  ],
  [
    "quarter",
    (b) => {
      b.record.quarter = "2027-Q1";
    },
  ],
  [
    "percentage",
    (b) => {
      b.record.percentageBp = 2500;
    },
  ],
  [
    "wrong seed",
    (b) => {
      b.revealedSeed = "wrong";
    },
  ],
  [
    "fleet removal",
    (b) => {
      b.record.eligibleVehicleIds.pop();
    },
  ],
  [
    "duplicate fleet",
    (b) => {
      b.record.eligibleVehicleIds.push("veh-a");
    },
  ],
  [
    "eligible count",
    (b) => {
      b.record.eligibleCount++;
    },
  ],
  [
    "selected count",
    (b) => {
      b.record.selectedCount++;
    },
  ],
  [
    "selected id",
    (b) => {
      b.record.selected[0]!.vehicleId = "not-eligible";
    },
  ],
  [
    "rank",
    (b) => {
      b.record.selected[0]!.rank = 5;
    },
  ],
  [
    "score",
    (b) => {
      b.record.selected[0]!.score = "0".repeat(64);
    },
  ],
  [
    "snapshot",
    (b) => {
      b.record.snapshotSha256 = "0".repeat(64);
    },
  ],
  [
    "commitment",
    (b) => {
      b.record.commitment = "0".repeat(64);
    },
  ],
  [
    "selected duplicate",
    (b) => {
      b.record.selected[1] = { ...b.record.selected[0]! };
    },
  ],
  [
    "noninteger count",
    (b) => {
      b.record.selectedCount = 1.5;
    },
  ],
  [
    "unsafe count",
    (b) => {
      b.record.eligibleCount = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    "timestamp",
    (b) => {
      b.record.createdAt = "not-a-date";
    },
  ],
];
it.each(edits)("rejects tampered %s", (_name, edit) => {
  const bundle = structuredClone(legacy);
  edit(bundle);
  expect(verifyAuditBundle(bundle).ok).toBe(false);
});
it("does not trust informational algorithm prose as executable instructions", () => {
  expect(
    verifyAuditBundle({
      ...legacy,
      algorithm: "arbitrary informational description",
    }).ok,
  ).toBe(true);
});
it("catches throwing envelopes without echoing secret error text", () => {
  const report = verifyAuditBundle({
    get record() {
      throw new Error("secret-error-content");
    },
    revealedSeed: "x",
    algorithm: "x",
  });
  expect(report.ok).toBe(false);
  expect(JSON.stringify(report)).not.toContain("secret-error-content");
});
it("detects missing selected entries and sparse arrays", () => {
  for (const selected of [null, [null], new Array(2)]) {
    expect(verifyAuditBundle({ ...legacy, record: { ...legacy.record, selected } }).ok).toBe(false);
  }
});
