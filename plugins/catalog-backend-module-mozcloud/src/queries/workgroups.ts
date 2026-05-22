interface WorkgroupsQueryConfig {
  project: string;
  dataset: string;
  /** Defaults to `workgroups`. */
  workgroupsTable?: string;
}

const DEFAULT_WORKGROUPS_TABLE = 'workgroups';

/**
 * Reads the pre-aggregated `<dataset>.<workgroupsTable>` view directly:
 * each row is one workgroup with a nested `subgroups` ARRAY<RECORD>.
 *
 * The `users` field on each subgroup (the canonical list of human members)
 * is intentionally dropped here — it belongs to the dedicated users source
 * ({@link usersQuery}). What remains in `subgroups.members` is the IAM-
 * principal binding list (`group:…` and `serviceAccount:…` refs) used to
 * grant access at the cloud-platform layer.
 */
export function workgroupsQuery(cfg: WorkgroupsQueryConfig): string {
  const workgroupsTable = cfg.workgroupsTable ?? DEFAULT_WORKGROUPS_TABLE;
  const wgTable = `\`${cfg.project}.${cfg.dataset}.${workgroupsTable}\``;

  return `
    SELECT
      w.workgroup,
      w.sponsor,
      w.managers,
      w.tickets,
      ARRAY(
        SELECT AS STRUCT
          w.workgroup as parent,
          sg.name,
          sg.managers,
          sg.members,
          sg.google_groups,
          sg.workgroups,
          sg.service_accounts
        FROM UNNEST(w.subgroups) sg
      ) AS subgroups
    FROM ${wgTable} w
  `;
}

export function workgroupsSourceDescription(cfg: WorkgroupsQueryConfig): string {
  const workgroupsTable = cfg.workgroupsTable ?? DEFAULT_WORKGROUPS_TABLE;
  return `bigquery:${cfg.project}.${cfg.dataset}.${workgroupsTable}`;
}
