import type { AlgorithmVersion } from "./algorithm-version";

export interface SelectedVehicle {
  vehicleId: string;
  rank: number;
  score: string;
}

/** The computed outcome of a draw: what replay must reproduce exactly. */
export interface SelectionResult {
  algorithmVersion: AlgorithmVersion;
  companyId: string;
  quarter: string;
  percentageBp: number;
  eligibleCount: number;
  selectedCount: number;
  snapshotSha256: string;
  selected: SelectedVehicle[];
}

/** A committed draw: the result plus the frozen inputs and seed commitment. */
export interface SelectionRunRecord extends SelectionResult {
  commitment: string;
  eligibleVehicleIds: string[];
  createdAt: string;
}
