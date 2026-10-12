import type { AlgorithmVersion } from "../model";

/**
 * One versioned way of turning a seed into per-vehicle HMAC scores
 * (strategy pattern). Each version lives in its own file.
 */
export interface ScoringAlgorithm {
  readonly version: AlgorithmVersion;
  readonly description: string;

  /** Validates the seed and returns the HMAC key bytes. */
  hmacKey(seed: unknown): Buffer;

  /** The exact message that is HMAC'd for one vehicle. */
  message(companyId: string, quarter: string, vehicleId: string): string;
}
