import { TenantRow } from '../transform/schema';

/**
 * A pluggable source of tenant rows. Implementations read either from
 * BigQuery (`mozdata.mozcloud.tenants`) or from a local filesystem path
 * containing tenant YAMLs (for offline development).
 *
 * `fetchAll` returns rows that have already been validated against the
 * tenant schema. Invalid rows are skipped and logged by the implementation;
 * one bad row should not prevent the rest from being imported.
 */
export interface Source {
  /** Stable identifier used in log lines and the provider's location key. */
  readonly description: string;
  fetchAll(): Promise<TenantRow[]>;
}
