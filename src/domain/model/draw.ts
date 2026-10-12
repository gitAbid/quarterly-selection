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
