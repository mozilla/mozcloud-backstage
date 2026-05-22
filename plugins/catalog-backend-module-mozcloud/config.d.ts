import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      mozcloud?: {
        tenants?: {
          /**
           * Read tenant rows from BigQuery. Auth follows ADC — Workload
           * Identity in GKE, application-default credentials locally.
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
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
        /**
         * Charts source. Joins the per-tenant declared charts list
         * (`tenants.globals.deployment.charts`) with the flat deployment
         * fact table (`tenants_deployed_charts`) to produce one row per
         * `(tenant, chart_name)` with chart metadata + a nested
         * deployment tree (realm -> environments -> regions).
         *
         * Optional. When present, the tenant entity provider uses it to
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
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
        /**
         * Workgroups source. Joins two tables — a parent workgroup table
         * and a flat (workgroup, subgroup, value) members table — to
         * reconstruct the nested membership shape the entity transform
         * consumes.
         */
        workgroups?: {
          bigquery: {
            project: string;
            dataset: string;
            /** Defaults to `wstuckey_workgroups`. */
            workgroupsTable?: string;
            /** Defaults to `wstuckey_subgroup_members`. */
            subgroupMembersTable?: string;
            /**
             * Project that BQ jobs run (and bill) under. Defaults to
             * `project`. Useful when the caller can read mozdata tables
             * but doesn't have `bigquery.jobs.create` on `mozdata`.
             */
            billingProject?: string;
          };
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
      };
    };
  };
}
