interface UsersQueryConfig {
  project: string;
  dataset: string;
  /** Defaults to `workgroup_subgroup_members`. */
  subgroupMembersTable?: string;
  /**
   * Fully-qualified `project.dataset.table` for the Workday person
   * directory, joined on email to enrich users with their display name.
   * Defaults to `mozdata.workday.person_mozilla_com`. Set explicitly if
   * you're running in a project that exposes the directory under a
   * different name.
   */
  personDirectoryTable?: string;
}

const DEFAULT_SUBGROUP_MEMBERS_TABLE = 'workgroup_subgroup_members';
const DEFAULT_PERSON_DIRECTORY_TABLE = 'mozdata.workday.person_mozilla_com';

/**
 * One row per distinct user (by `value`, the email) aggregating:
 *
 * - Display name (`name`) — LEFT JOINed from the Workday person directory
 *   so non-employees (gmail, contractor addresses, etc.) get NULL rather
 *   than the lookup failing the whole query.
 * - GitHub identity (`github_login`, `github_orgs`) — per-user, the same
 *   across every membership row for that user. We pick a representative
 *   non-null `github_login` via `MAX` and union `github_orgs` across rows
 *   so the result tolerates partial backfills.
 * - `memberships[]` — every `(workgroup, subgroup)` the user belongs to,
 *   sorted for deterministic output.
 *
 * Only `member_type = 'user'` rows are considered — workgroup, service-
 * account, and google-group bindings stay with the workgroups source.
 */
export function usersQuery(cfg: UsersQueryConfig): string {
  const subgroupMembersTable =
    cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
  const memTable = `\`${cfg.project}.${cfg.dataset}.${subgroupMembersTable}\``;
  const personTable = `\`${
    cfg.personDirectoryTable ?? DEFAULT_PERSON_DIRECTORY_TABLE
  }\``;

  return `
    WITH agg AS (
      SELECT
        m.value AS email,
        MAX(p.name) AS name,
        MAX(m.github_login) AS github_login,
        ARRAY_CONCAT_AGG(m.github_orgs) AS github_orgs_concat,
        ARRAY_AGG(STRUCT(m.workgroup, m.subgroup) ORDER BY m.workgroup, m.subgroup) AS memberships
      FROM ${memTable} m
      LEFT JOIN ${personTable} p
        ON LOWER(p.email) = LOWER(m.value)
      WHERE m.member_type = 'user'
      GROUP BY m.value
    )
    SELECT
      email,
      name,
      github_login,
      ARRAY(
        SELECT DISTINCT o FROM UNNEST(github_orgs_concat) o ORDER BY o
      ) AS github_orgs,
      memberships
    FROM agg
  `;
}

export function usersSourceDescription(cfg: UsersQueryConfig): string {
  const subgroupMembersTable =
    cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
  return `bigquery:${cfg.project}.${cfg.dataset}.${subgroupMembersTable}#users`;
}
