interface ChartsDeploymentsQueryConfig {
  project: string;
  dataset: string;
  /** Defaults to `tenants`. */
  tenantsTable?: string;
  /** Defaults to `tenants_deployed_charts`. */
  deployedChartsTable?: string;
}

const DEFAULT_TENANTS_TABLE = 'tenants';
const DEFAULT_DEPLOYED_CHARTS_TABLE = 'tenants_deployed_charts';

/**
 * Consolidate per-chart declared metadata with the actual deployment
 * facts. One row per `(tenant, chart_name)`. Joins:
 *
 * - `<dataset>.<tenantsTable>.globals.deployment.charts[]` — chart-level
 *   declarations (image refs, application_repository, release_name).
 * - `<dataset>.<deployedChartsTable>` — flat fact table of where the
 *   chart is actually deployed `(realm, environment, region)`.
 *
 * Tenant-level metadata needed by `chartToEntities` is hoisted onto
 * every row so the transform can run on a single row in isolation:
 * `chart_count` (sibling chart count for naming), `function`,
 * `workgroups`, `deployment_type`.
 *
 * Per-deployment image tags are intentionally NOT modeled here — the
 * `tenants_deployed_charts` table doesn't carry them; rolling state
 * lives in Argo CD / k8s. The `images` field on the result row is the
 * chart's declared image refs from `globals.deployment.charts`.
 */
export function chartsDeploymentsQuery(
  cfg: ChartsDeploymentsQueryConfig,
): string {
  const tenantsTable = cfg.tenantsTable ?? DEFAULT_TENANTS_TABLE;
  const deployedChartsTable =
    cfg.deployedChartsTable ?? DEFAULT_DEPLOYED_CHARTS_TABLE;
  const tenants = `\`${cfg.project}.${cfg.dataset}.${tenantsTable}\``;
  const deployed = `\`${cfg.project}.${cfg.dataset}.${deployedChartsTable}\``;

  return `
    SELECT
      t.tenant,
      chart.name AS chart_name,
      ARRAY_LENGTH(globals.deployment.charts) AS chart_count,
      globals.function AS function,
      globals.workgroups AS workgroups,
      globals.deployment.type AS deployment_type,
      chart.application_repository AS application_repository,
      chart.release_name AS release_name,
      chart.images AS images,
      ARRAY(
        SELECT AS STRUCT * except (tenant)
        FROM ${deployed} WHERE tenant = t.tenant AND chart.name = chart_name
      ) AS deployments
    FROM ${tenants} t
    INNER JOIN UNNEST(globals.deployment.charts) AS chart
  `;
}

export function chartsDeploymentsSourceDescription(
  cfg: ChartsDeploymentsQueryConfig,
): string {
  const tenantsTable = cfg.tenantsTable ?? DEFAULT_TENANTS_TABLE;
  const deployedChartsTable =
    cfg.deployedChartsTable ?? DEFAULT_DEPLOYED_CHARTS_TABLE;
  return `bigquery:${cfg.project}.${cfg.dataset}.{${tenantsTable}+${deployedChartsTable}}`;
}
