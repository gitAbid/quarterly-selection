import { createHash, createHmac } from "node:crypto";
import type { AlgorithmVersion, DrawInput, SelectionResult } from "./types";
import { SelectionInputError } from "./errors";
import { compareStrings, validText, validateDrawInput } from "./validation";
export function snapshotHash(canonicalIds: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalIds), "utf8")
    .digest("hex");
}
export function replaySelection(
  input: DrawInput,
  seedHex: string,
  version: AlgorithmVersion = "v2",
): SelectionResult {
  const key = seedBytes(seedHex, version);
  const valid = validateDrawInput(input);
  const canonical = valid.vehicleIds;
  const selectedCount = Math.floor(
    (canonical.length * valid.percentageBp + 9_999) / 10_000,
  );
  const scored = canonical.map((vehicleId) => ({
    vehicleId,
    score: createHmac("sha256", key)
      .update(
        version === "v1"
          ? `v1|${valid.companyId}|${valid.quarter}|${vehicleId}`
          : JSON.stringify([
              version,
              valid.companyId,
              valid.quarter,
              vehicleId,
            ]),
        "utf8",
      )
      .digest("hex"),
  }));
  scored.sort(
    (a, b) =>
      compareStrings(a.score, b.score) ||
      compareStrings(a.vehicleId, b.vehicleId),
  );
  return {
    algorithmVersion: version,
    companyId: valid.companyId,
    quarter: valid.quarter,
    percentageBp: valid.percentageBp,
    eligibleCount: canonical.length,
    selectedCount,
    snapshotSha256: snapshotHash(canonical),
    selected: scored
      .slice(0, selectedCount)
      .map((s, i) => ({ ...s, rank: i + 1 })),
  };
}

export function seedBytes(seed: unknown, version: AlgorithmVersion): Buffer {
  if (version !== "v1" && version !== "v2")
    throw new SelectionInputError("unsupported algorithm version");
  if (version === "v1") {
    if (!validText(seed))
      throw new SelectionInputError(
        "legacy seed must be a nonblank, well-formed string",
      );
    return Buffer.from(seed, "utf8");
  }
  if (typeof seed !== "string" || !/^[0-9a-f]{64}$/.test(seed))
    throw new SelectionInputError(
      "v2 seed must be 32 bytes encoded as lowercase hexadecimal",
    );
  return Buffer.from(seed, "hex");
}
export function commitSeed(seed: string, version: AlgorithmVersion): string {
  return createHash("sha256").update(seedBytes(seed, version)).digest("hex");
}
