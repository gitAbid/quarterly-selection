import type {
  AuditBundle,
  DrawInput,
  SelectionRunRecord,
} from "../domain/model";

export interface RunOutcome {
  record: SelectionRunRecord;
  /** True when the draw already existed and was returned instead of drawing again. */
  reused: boolean;
  /** False when the request differs from the inputs the draw was made with. */
  inputsMatch: boolean;
}

/** The public use cases. */
export interface SelectionService {
  createOrGet(input: DrawInput): Promise<RunOutcome>;

  get(
    companyId: string,
    quarter: string,
  ): Promise<SelectionRunRecord | undefined>;

  exportAudit(companyId: string, quarter: string): Promise<AuditBundle>;

  close(): Promise<void>;
}
