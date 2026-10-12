import { SelectionInputError } from "../errors";
import { isWellFormedText } from "../validation";
import type { ScoringAlgorithm } from "./scoring-algorithm";

/** Replay-only: kept so the verifier can check audit files from an earlier prototype. */
export const legacyV1: ScoringAlgorithm = {
  version: "v1",
  description:
    "v1: UTF-8 string seed; delimiter HMAC context; ceiling basis-point count; score then code-unit ID ranking.",

  hmacKey(seed) {
    if (!isWellFormedText(seed)) throw new SelectionInputError("legacy seed must be a nonblank, well-formed string");
    return Buffer.from(seed, "utf8");
  },

  message(companyId, quarter, vehicleId) {
    return `v1|${companyId}|${quarter}|${vehicleId}`;
  },
};
