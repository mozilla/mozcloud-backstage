import { LoggerService } from '@backstage/backend-plugin-api';
import { BigQuery } from '@google-cloud/bigquery';
import { Source } from './Source';
import { WorkgroupRow, WorkgroupRowSchema } from '../transform/schema';

interface WorkgroupBigQueryConfig {
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
 * Reads workgroup rows from a join of two BigQuery tables:
 *
 * - `<dataset>.<workgroupsTable>` provides per-workgroup metadata
 *   (sponsor, managers, tickets) and the canonical list of subgroup names.
 * - `<dataset>.<subgroupMembersTable>` provides the exploded membership
 *   (one row per (workgroup, subgroup, value)) with `member_type` partitioning
 *   users, cross-workgroup refs, service accounts, and Google Groups.
 *   The `resolved_email` column carries the actual SA address when the
 *   raw `value` was a Terraform remote-state ref.
 *
 * The query reconstructs the nested {@link WorkgroupRow} shape that
 * {@link workgroupToEntities} consumes — so the BigQuery source plugs in
 * behind the same transform as the filesystem source. Bad rows are
 * skipped and logged; one malformed workgroup never fails the batch.
 */
export class WorkgroupBigQuerySource implements Source<WorkgroupRow> {
  readonly description: string;
  private readonly workgroupsTable: string;
  private readonly subgroupMembersTable: string;

  constructor(
    private readonly cfg: WorkgroupBigQueryConfig,
    private readonly logger: LoggerService,
    private readonly bq: BigQuery = new BigQuery({ projectId: cfg.project }),
  ) {
    this.workgroupsTable = cfg.workgroupsTable ?? DEFAULT_WORKGROUPS_TABLE;
    this.subgroupMembersTable =
      cfg.subgroupMembersTable ?? DEFAULT_SUBGROUP_MEMBERS_TABLE;
    this.description = `bigquery:${cfg.project}.${cfg.dataset}.{${this.workgroupsTable}+${this.subgroupMembersTable}}`;
  }

  async fetchAll(): Promise<WorkgroupRow[]> {
    const wgTable = `\`${this.cfg.project}.${this.cfg.dataset}.${this.workgroupsTable}\``;
    const memTable = `\`${this.cfg.project}.${this.cfg.dataset}.${this.subgroupMembersTable}\``;

    // The CTE flattens membership per (workgroup, subgroup, type) into the
    // shape WorkgroupRow expects. service_account values fall back to the
    // raw value when resolved_email isn't set (e.g. an explicit SA email).
    const sql = `
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

    const [rows] = await this.bq.query({ query: sql });
    const out: WorkgroupRow[] = [];

    for (const row of rows) {
      try {
        out.push(WorkgroupRowSchema.parse(row));
      } catch (error) {
        this.logger.warn(
          `Skipping invalid workgroup row (workgroup=${
            (row as { workgroup?: string }).workgroup ?? '?'
          }): ${(error as Error).message}`,
        );
      }
    }

    return out;
  }
}
