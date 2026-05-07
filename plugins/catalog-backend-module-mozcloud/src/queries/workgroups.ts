interface WorkgroupsQueryConfig {
  project: string;
  dataset: string;
  /** Defaults to `wstuckey_workgroups`. */
  workgroupsTable?: string;
  /** Defaults to `wstuckey_subgroup_members`. */
  subgroupMembersTable?: string;
}

const DEFAULT_WORKGROUPS_TABLE = 'wstuckey_workgroups';
const DEFAULT_SUBGROUP_MEMBERS_TABLE = 'wstuckey_subgroup_members';

/**
 * Reconstructs the nested {@link WorkgroupRow} shape from two flat
 * BigQuery tables:
 *
 * - `<dataset>.<workgroupsTable>` — per-workgroup metadata (sponsor,
 *   managers, tickets) and the canonical list of subgroup names.
 * - `<dataset>.<subgroupMembersTable>` — exploded membership, one row
 *   per `(workgroup, subgroup, value)` with `member_type` partitioning
 *   users, cross-workgroup refs, service accounts, and Google Groups.
 *   `resolved_email` carries the actual SA address when the raw `value`
 *   is a Terraform remote-state reference.
 *
 * The CTE flattens membership per `(workgroup, subgroup)`; the outer
 * SELECT folds the per-subgroup rows back into a nested ARRAY<STRUCT>
 * on the workgroup row so a single SELECT yields one row per workgroup.
 */
export function workgroupsQuery(cfg: WorkgroupsQueryConfig): string {
  const workgroupsTable = cfg.workgroupsTable ?? DEFAULT_WORKGROUPS_TABLE;
  const subgroupMembersTable =
    cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
  const wgTable = `\`${cfg.project}.${cfg.dataset}.${workgroupsTable}\``;
  const memTable = `\`${cfg.project}.${cfg.dataset}.${subgroupMembersTable}\``;

  return `
    WITH members_per_subgroup AS (
      SELECT
        workgroup,
        subgroup,
        ARRAY_AGG(IF(member_type = 'user', value, NULL) IGNORE NULLS) AS members,
        ARRAY_AGG(IF(member_type = 'workgroup', value, NULL) IGNORE NULLS) AS workgroups,
        ARRAY_AGG(IF(member_type = 'service_account', COALESCE(resolved_email, value), NULL) IGNORE NULLS) AS service_accounts,
        ARRAY_AGG(IF(member_type = 'google_group', value, NULL) IGNORE NULLS) AS google_groups
      FROM ${memTable}
      GROUP BY workgroup, subgroup
    )
    SELECT
      w.workgroup,
      w.sponsor,
      w.managers,
      w.tickets,
      ARRAY(
        SELECT AS STRUCT
          m.subgroup AS name,
          CAST([] AS ARRAY<STRING>) AS managers,
          COALESCE(m.members, CAST([] AS ARRAY<STRING>)) AS members,
          COALESCE(m.google_groups, CAST([] AS ARRAY<STRING>)) AS google_groups,
          COALESCE(m.workgroups, CAST([] AS ARRAY<STRING>)) AS workgroups,
          COALESCE(m.service_accounts, CAST([] AS ARRAY<STRING>)) AS service_accounts
        FROM members_per_subgroup m
        WHERE m.workgroup = w.workgroup
      ) AS subgroups
    FROM ${wgTable} w
  `;
}

/**
 * Builds the description string for a workgroups source, matching the
 * shape the provider uses as its catalog location key. Exported so the
 * call site doesn't duplicate the formatting logic.
 */
export function workgroupsSourceDescription(cfg: WorkgroupsQueryConfig): string {
  const workgroupsTable = cfg.workgroupsTable ?? DEFAULT_WORKGROUPS_TABLE;
  const subgroupMembersTable =
    cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
  return `bigquery:${cfg.project}.${cfg.dataset}.{${workgroupsTable}+${subgroupMembersTable}}`;
}
