import type { SelectionRunRecord } from "./selection-run";

/** Everything an auditor needs to replay a draw, including the revealed seed. */
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
