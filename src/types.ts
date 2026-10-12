export type AlgorithmVersion = "v1" | "v2";
export interface DrawInput {
  companyId: string;
  quarter: string;
  percentage: number;
  vehicleIds: readonly string[];
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
