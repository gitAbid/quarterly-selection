import { isAlgorithmVersion } from "./algorithm";
import { SelectionInputError } from "./errors";
import type { SelectedVehicle, SelectionRunRecord } from "./types";
import { isRecord, isWellFormedText, validateDrawInput } from "./validation";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isSha256Hex = (value: unknown): value is string =>
  typeof value === "string" && SHA256_HEX.test(value);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value >= 0;

/**
 * Parses untrusted data (a database row or an audit file) into a run record.
 * Checks structure only; whether the result is reproducible is checked by
 * verifyAuditBundle. Always returns a fresh copy, so callers can't alter the
 * stored evidence by mutating what they get back.
 */
export function parseRunRecord(value: unknown): SelectionRunRecord {
  if (!isRecord(value))
    throw new SelectionInputError("audit record must be an object");
  const { algorithmVersion, percentageBp } = value;
  if (!isAlgorithmVersion(algorithmVersion))
    throw new SelectionInputError("unsupported algorithm version");
  if (
    typeof percentageBp !== "number" ||
    !Number.isSafeInteger(percentageBp) ||
    percentageBp < 1 ||
    percentageBp > 10_000
  )
    throw new SelectionInputError("invalid recorded percentage");
  const input = validateDrawInput({
    companyId: value.companyId,
    quarter: value.quarter,
    percentage: percentageBp / 100,
    vehicleIds: value.eligibleVehicleIds,
  });
  const { eligibleCount, selectedCount, snapshotSha256, commitment } = value;
  if (!isCount(eligibleCount) || !isCount(selectedCount))
    throw new SelectionInputError("invalid recorded counts");
  if (!isSha256Hex(snapshotSha256) || !isSha256Hex(commitment))
    throw new SelectionInputError("invalid recorded hash");
  const createdAt = parseTimestamp(value.createdAt);
  const selected = parseSelected(value.selected);
  return {
    algorithmVersion,
    companyId: input.companyId,
    quarter: input.quarter,
    percentageBp,
    eligibleCount,
    selectedCount,
    snapshotSha256,
    selected,
    commitment,
    eligibleVehicleIds: [...input.vehicleIds],
    createdAt,
  };
}

function parseTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new SelectionInputError("invalid creation timestamp");
  return value;
}

function parseSelected(value: unknown): SelectedVehicle[] {
  if (!Array.isArray(value))
    throw new SelectionInputError("invalid selected entries");
  return Array.from(value, (entry: unknown) => {
    if (
      !isRecord(entry) ||
      !isWellFormedText(entry.vehicleId) ||
      typeof entry.rank !== "number" ||
      !Number.isSafeInteger(entry.rank) ||
      entry.rank < 1 ||
      !isSha256Hex(entry.score)
    )
      throw new SelectionInputError("invalid selected entries");
    return { vehicleId: entry.vehicleId, rank: entry.rank, score: entry.score };
  });
}
