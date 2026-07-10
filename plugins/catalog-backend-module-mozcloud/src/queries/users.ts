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
 * One row per staff member, sourced from the Workday person directory and
 * LEFT JOINed to workgroup membership so staff who aren't in any workgroup
 * still appear (with an empty `memberships` array):
 *
 * - `email` / `name` — from the person directory; this is the base set of
 *   users (all staff in the directory).
 * - GitHub identity (`github_login`, `github_node_id`, `github_orgs`) —
 *   from the membership rows when present. `MAX` picks a representative
 *   non-null id and `github_orgs` is unioned across a user's rows, so the
 *   result tolerates partial backfills.
 * - `memberships[]` — every `(workgroup, subgroup)` the user belongs to,
 *   sorted; empty for staff who aren't in a workgroup. Only
 *   `member_type = 'user'` bindings are joined — workgroup, service-account
 *   and google-group bindings stay with the workgroups source.
 */
export function usersQuery(cfg: UsersQueryConfig): string {
  const subgroupMembersTable =
    cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
  const membershipTable = `\`${cfg.project}.${cfg.dataset}.${subgroupMembersTable}\``;
  const personTable = `\`${
    cfg.personDirectoryTable ?? DEFAULT_PERSON_DIRECTORY_TABLE
  }\``;

  // `name` is read from the Workday person directory, so the executing
  // BigQuery identity must have read access to `personDirectoryTable`.
  return `
    WITH people AS (
      -- Canonical identity: lowercased with any plus-addressed subaddress
      -- removed, so aliases like alice+bugzilla@ collapse onto alice@ (the same
      -- mailbox / person) rather than emitting a second, dirty user row.
      SELECT REGEXP_REPLACE(LOWER(email), r'\\+[^@]*', '') AS email, name
      FROM ${personTable}
    ),
    agg AS (
      SELECT
        p.email AS email,
        ANY_VALUE(p.name) AS name,
        MAX(m.github_login) AS github_login,
        MAX(m.github_node_id) AS github_node_id,
        ARRAY_CONCAT_AGG(m.github_orgs) AS github_orgs_concat,
        ARRAY_AGG(
          IF(
            m.workgroup IS NULL,
            NULL,
            STRUCT(m.workgroup AS workgroup, m.subgroup AS subgroup)
          )
          IGNORE NULLS
          ORDER BY m.workgroup, m.subgroup
        ) AS memberships
      FROM people p
      LEFT JOIN ${membershipTable} m
        ON p.email = LOWER(m.value) AND m.member_type = 'user'
      GROUP BY p.email
    )
    SELECT
      email,
      name,
      github_login,
      github_node_id,
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
