export const ALGORITHM_VERSIONS = ["v1", "v2"] as const;
export type AlgorithmVersion = (typeof ALGORITHM_VERSIONS)[number];

/** Identifies one draw: at most one selection exists per company and quarter. */
export interface SelectionIdentity {
  readonly companyId: string;
  readonly quarter: string;
}

/** What the caller supplies for a draw. */
export interface DrawInput extends SelectionIdentity {
  readonly percentage: number;
  readonly vehicleIds: readonly string[];
}

/** A draw input after validation: IDs are sorted and the percentage is in basis points. */
export interface ValidatedDrawInput extends DrawInput {
  readonly percentageBp: number;
}

export interface SelectedVehicle {
  vehicleId: string;
  rank: number;
  score: string;
}

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

export interface SelectionRunRecord extends SelectionResult {
  commitment: string;
  eligibleVehicleIds: string[];
  createdAt: string;
}

export interface RunOutcome {
  record: SelectionRunRecord;
  reused: boolean;
  inputsMatch: boolean;
}

export interface AuditBundle {
  record: SelectionRunRecord;
  revealedSeed: string;
  algorithm: string;
}

export interface VerificationReport {
  ok: boolean;
  checks: Record<string, boolean>;
  errors: string[];
}

export interface SelectionService {
  createOrGet(input: DrawInput): Promise<RunOutcome>;
  get(
    companyId: string,
    quarter: string,
  ): Promise<SelectionRunRecord | undefined>;
  exportAudit(companyId: string, quarter: string): Promise<AuditBundle>;
  close(): Promise<void>;
}
