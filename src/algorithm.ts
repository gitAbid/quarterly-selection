import { SelectionInputError } from "./errors";
import { ALGORITHM_VERSIONS, type AlgorithmVersion } from "./types";
import { isWellFormedText } from "./validation";

/**
 * One versioned way of turning a seed into per-vehicle HMAC scores.
 * Strategy pattern: adding a version means adding an entry to ALGORITHMS,
 * without touching the selection code that uses it.
 */
export interface ScoringAlgorithm {
  readonly version: AlgorithmVersion;
  readonly description: string;
  /** Validates the seed and returns the HMAC key bytes. */
  hmacKey(seed: unknown): Buffer;
  /** The exact message that is HMAC'd for one vehicle. */
  message(companyId: string, quarter: string, vehicleId: string): string;
}

const SEED_HEX = /^[0-9a-f]{64}$/;

const legacyV1: ScoringAlgorithm = {
  version: "v1",
  description:
    "v1: UTF-8 string seed; delimiter HMAC context; ceiling basis-point count; score then code-unit ID ranking.",
  hmacKey(seed) {
    if (!isWellFormedText(seed))
      throw new SelectionInputError(
        "legacy seed must be a nonblank, well-formed string",
      );
    return Buffer.from(seed, "utf8");
  },
  message: (companyId, quarter, vehicleId) =>
    `v1|${companyId}|${quarter}|${vehicleId}`,
};

const currentV2: ScoringAlgorithm = {
  version: "v2",
  description:
    "v2: decoded 32-byte hex seed; UTF-8 compact JSON [version,company,quarter,vehicle] HMAC context; ceiling basis-point count; score then code-unit ID ranking.",
  hmacKey(seed) {
    if (typeof seed !== "string" || !SEED_HEX.test(seed))
      throw new SelectionInputError(
        "v2 seed must be 32 bytes encoded as lowercase hexadecimal",
      );
    return Buffer.from(seed, "hex");
  },
  message: (companyId, quarter, vehicleId) =>
    JSON.stringify(["v2", companyId, quarter, vehicleId]),
};

const ALGORITHMS: Readonly<Record<AlgorithmVersion, ScoringAlgorithm>> = {
  v1: legacyV1,
  v2: currentV2,
};

/** New draws always use this version; older versions are replay-only. */
export const CURRENT_ALGORITHM: AlgorithmVersion = "v2";

export function isAlgorithmVersion(value: unknown): value is AlgorithmVersion {
  return ALGORITHM_VERSIONS.some((version) => version === value);
}

export function algorithmFor(version: unknown): ScoringAlgorithm {
  if (!isAlgorithmVersion(version))
    throw new SelectionInputError("unsupported algorithm version");
  return ALGORITHMS[version];
}
