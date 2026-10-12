import { SelectionInputError } from "../errors";
import type { ScoringAlgorithm } from "./scoring-algorithm";

const SEED_HEX = /^[0-9a-f]{64}$/;

/** The version used for every new draw. */
export const currentV2: ScoringAlgorithm = {
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

  message(companyId, quarter, vehicleId) {
    return JSON.stringify(["v2", companyId, quarter, vehicleId]);
  },
};
