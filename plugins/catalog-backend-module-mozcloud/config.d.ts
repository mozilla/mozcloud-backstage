import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      mozcloud?: {
        tenants?: {
          sources?: {
            tenants?: {
              /**
               * Read tenant rows from BigQuery.
               */
              bigquery: {
                project: string;
                dataset: string;
                table: string;
                /**
                 * Project that BQ jobs run (and bill) under. Defaults to
                 * `project`. Useful when the caller can read mozdata tables
                 * but doesn't have `bigquery.jobs.create` on `mozdata`.
                 */
                billingProject?: string;
              };
            };

            /**
             * Charts source. Joins the per-tenant declared charts list
             * (`tenants.globals.deployment.charts`) with the flat deployment
             * fact table (`tenants_deployed_charts`) to produce one row per
             * `(tenant, chart_name)` with chart metadata + a nested
             * deployment tree (realm -> environments -> regions).
             *
             * The tenant entity provider uses it to
             * enrich its chart Components with deployment annotations.
             */
            charts?: {
              bigquery: {
                project: string;
                dataset: string;
                /** Defaults to `tenants`. */
                tenantsTable?: string;
                /** Defaults to `tenants_deployed_charts`. */
                deployedChartsTable?: string;
                /**
                 * Project that BQ jobs run (and bill) under. Defaults to
                 * `project`. Useful when the caller can read mozdata tables
                 * but doesn't have `bigquery.jobs.create` on `mozdata`.
                 */
                billingProject?: string;
              };
            };
          };
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };

        workgroups?: {
          sources: {
            /**
             * Workgroups source. Reads the pre-aggregated workgroups view
             * (one row per workgroup with nested subgroups). Drives Group
             * entities only — human users live on the separate `users`
             * source below.
             */
            workgroups?: {
              bigquery: {
                project: string;
                dataset: string;
                /** Defaults to `workgroups`. */
                workgroupsTable?: string;
                /**
                 * Project that BQ jobs run (and bill) under. Defaults to
                 * `project`. Useful when the caller can read mozdata tables
                 * but doesn't have `bigquery.jobs.create` on `mozdata`.
                 */
                billingProject?: string;
              };
            };
            /**
             * Users source. Reads the flat `workgroup_subgroup_members`
             * table filtered to `member_type='user'`, aggregating per email
             * to produce one row per human with GitHub identity and the
             * `(workgroup, subgroup)` memberships they hold.
             *
             * The workgroup provider emits User
             * entities and back-fills each subgroup Group's `spec.members`.
             */
            users?: {
              bigquery: {
                project: string;
                dataset: string;
                /** Defaults to `workgroup_subgroup_members`. */
                subgroupMembersTable?: string;
                billingProject?: string;
              };
            };
          };
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
      };
    };
  };
}
