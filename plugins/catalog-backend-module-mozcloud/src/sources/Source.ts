/**
 * A pluggable source of structured rows. Each implementation reads either
 * from BigQuery or from a local filesystem directory of YAMLs and validates
 * results against a Zod schema before returning. Invalid rows are skipped
 * and logged so one bad row never prevents the rest from being imported.
 */
export interface Source<T> {
  /** Stable identifier used in log lines and the provider's location key. */
  readonly description: string;
  fetchAll(): Promise<T[]>;
}
