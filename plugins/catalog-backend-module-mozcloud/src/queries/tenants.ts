interface TenantsQueryConfig {
  project: string;
  dataset: string;
  table: string;
}

/**
 * Tenants are exported to BigQuery as one row per tenant. The current
 * shape is a single-table `SELECT *`; if a future change needs to join
 * realm- or chart-level data sitting in sibling tables, edit this
 * function and update {@link TenantRowSchema} to match.
 */
export function tenantsQuery(cfg: TenantsQueryConfig): string {
  return `SELECT * FROM \`${cfg.project}.${cfg.dataset}.${cfg.table}\``;
}
