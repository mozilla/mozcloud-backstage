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
