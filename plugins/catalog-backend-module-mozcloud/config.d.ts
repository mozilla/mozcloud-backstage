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
         * Reserved for the v2 workgroups provider, wired up but inert until
         * the `mozdata.mozcloud.workgroups` BigQuery table exists.
         */
        workgroups?: {
          bigquery?: {
            project: string;
            dataset: string;
            table: string;
          };
          path?: string;
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };
      };
    };
  };
}
