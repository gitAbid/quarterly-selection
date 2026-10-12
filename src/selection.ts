import { createHash, createHmac } from "node:crypto";
import { algorithmFor, CURRENT_ALGORITHM, type ScoringAlgorithm } from "./algorithm";
import type {
  AlgorithmVersion,
  DrawInput,
  SelectedVehicle,
  SelectionResult,
  ValidatedDrawInput,
} from "./types";
import { compareCodeUnits, validateDrawInput } from "./validation";

const BASIS_POINTS_PER_WHOLE = 10_000;

/** ceil(eligible × basisPoints / 10,000), in exact integer arithmetic. */
export function selectedCountFor(eligible: number, basisPoints: number): number {
  return Math.floor(
    (eligible * basisPoints + BASIS_POINTS_PER_WHOLE - 1) /
      BASIS_POINTS_PER_WHOLE,
  );
}

export function snapshotHash(canonicalIds: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalIds), "utf8")
    .digest("hex");
}

export function commitSeed(seed: string, version: AlgorithmVersion): string {
  return createHash("sha256")
    .update(algorithmFor(version).hmacKey(seed))
    .digest("hex");
}

/**
 * Pure and deterministic: the same input, seed and version always give the
 * same result. No randomness, no I/O, and no uniqueness guarantee on its own.
 */
export function replaySelection(
  input: DrawInput,
  seedHex: string,
  version: AlgorithmVersion = CURRENT_ALGORITHM,
): SelectionResult {
  const algorithm = algorithmFor(version);
  const key = algorithm.hmacKey(seedHex);
  const valid = validateDrawInput(input);
  const selectedCount = selectedCountFor(
    valid.vehicleIds.length,
    valid.percentageBp,
  );
  const ranked = rankVehicles(algorithm, key, valid);
  return {
    algorithmVersion: algorithm.version,
    companyId: valid.companyId,
    quarter: valid.quarter,
    percentageBp: valid.percentageBp,
    eligibleCount: valid.vehicleIds.length,
    selectedCount,
    snapshotSha256: snapshotHash(valid.vehicleIds),
    selected: ranked
      .slice(0, selectedCount)
      .map((vehicle, i) => ({ ...vehicle, rank: i + 1 })),
  };
}

type ScoredVehicle = Omit<SelectedVehicle, "rank">;

function rankVehicles(
  algorithm: ScoringAlgorithm,
  key: Buffer,
  input: ValidatedDrawInput,
): ScoredVehicle[] {
  return input.vehicleIds
    .map((vehicleId) => ({
      vehicleId,
      score: createHmac("sha256", key)
        .update(algorithm.message(input.companyId, input.quarter, vehicleId), "utf8")
        .digest("hex"),
    }))
    .sort(
      (a, b) =>
        compareCodeUnits(a.score, b.score) ||
        compareCodeUnits(a.vehicleId, b.vehicleId),
    );
}
