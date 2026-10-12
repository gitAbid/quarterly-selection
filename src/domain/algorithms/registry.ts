import { SelectionInputError } from "../errors";
import { ALGORITHM_VERSIONS, type AlgorithmVersion } from "../model";
import { currentV2 } from "./current-v2";
import { legacyV1 } from "./legacy-v1";
import type { ScoringAlgorithm } from "./scoring-algorithm";

/** Adding a version means adding an entry here; selection code doesn't change. */
const ALGORITHMS: Readonly<Record<AlgorithmVersion, ScoringAlgorithm>> = {
  v1: legacyV1,
  v2: currentV2,
};

/** New draws always use this version; older versions are replay-only. */
export const CURRENT_ALGORITHM: AlgorithmVersion = "v2";

export function algorithmFor(version: unknown): ScoringAlgorithm {
  if (!isAlgorithmVersion(version)) throw new SelectionInputError("unsupported algorithm version");
  return ALGORITHMS[version];
}

export function isAlgorithmVersion(value: unknown): value is AlgorithmVersion {
  return ALGORITHM_VERSIONS.some((version) => version === value);
}
