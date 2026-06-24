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
          /**
           * Optional owner-authored overlay. When enabled, the tenant
           * provider fetches a per-tenant catalog-info.yaml and folds it
           * into its full mutation — owners can enrich their generated
           * entities and add new ones scoped to their System.
           */
          overlay?: {
            /** Master switch; overlays are ignored unless `true`. */
            enabled: boolean;
            /** Repo URL template, e.g. `https://github.com/mozilla/{function}-infra`. */
            repoUrlTemplate: string;
            /** Path template within the repo, e.g. `{app_code}/catalog-info.yaml`. */
            pathTemplate: string;
            /** Branch the overlay file lives on. Defaults to `main`. */
            branch?: string;
          };
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
        };

        mozcloudPeople?: {
          auth: {
            /** Auth0 token endpoint, e.g. https://auth.mozilla.auth0.com/oauth/token */
            tokenUrl: string;
            /** OAuth2 audience, e.g. api.sso.mozilla.com */
            audience: string;
            clientId: string;
            /** @visibility secret */
            clientSecret: string;
            /** Space-separated CIS scopes the credential is granted. */
            scope?: string;
          };
          /** Base URL, e.g. https://person.api.sso.mozilla.com/v2 */
          apiBaseUrl: string;
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
