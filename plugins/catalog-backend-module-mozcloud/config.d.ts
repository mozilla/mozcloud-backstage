import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      mozcloud?: {
        tenants?: {
          /**
           * Read tenant rows from BigQuery. Used in deployed environments
           * where the backend has Workload Identity bound to a service account
           * with read access to the table.
           */
          bigquery?: {
            project: string;
            dataset: string;
            table: string;
          };
          /**
           * Local-dev fallback: read tenant YAML files directly from a
           * filesystem path. Useful when the developer doesn't have GCP creds.
           * Either `bigquery` or `path` must be set, but not both.
           */
          path?: string;
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
        /**
         * Workgroups source. BigQuery mode joins two tables — a parent
         * workgroup table and a flat (workgroup, subgroup, value) members
         * table — to reconstruct the nested membership shape consumed by
         * the entity transform.
         */
        workgroups?: {
          bigquery?: {
            project: string;
            dataset: string;
            /** Defaults to `wstuckey_workgroups`. */
            workgroupsTable?: string;
            /** Defaults to `wstuckey_subgroup_members`. */
            subgroupMembersTable?: string;
          };
          /** Local-dev fallback: directory of workgroup YAMLs. */
          path?: string;
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
      };
    };
  };
}
