import { Entity, EntityLink } from '@backstage/catalog-model';
import { ChartDeploymentsRow } from './schema';
import { pickDefined, tenantOwner } from './refs';

const INFRA_ORG = 'mozilla';

/**
 * Base GitHub URL for a function's infra repo, e.g.
 * `https://github.com/mozilla/webservices-infra`.
 */
function infraRepoUrl(functionName: string): string {
  return `https://github.com/${INFRA_ORG}/${functionName}-infra`;
}

/**
 * GitHub URL to a chart's Helm chart directory in the function's infra repo:
 *   https://github.com/mozilla/<function>-infra/tree/main/<system>/k8s/<component>
 */
function chartDirUrl(
  functionName: string,
  system: string,
  component: string,
): string {
  return `${infraRepoUrl(functionName)}/tree/main/${system}/k8s/${component}`;
}

/**
 * GitHub URL to a chart's environment-specific values file:
 *   https://github.com/mozilla/<function>-infra/blob/main/<system>/k8s/<component>/values-<env>.yaml
 */
function valuesFileUrl(
  functionName: string,
  system: string,
  component: string,
  env: string,
): string {
  return `${infraRepoUrl(
    functionName,
  )}/blob/main/${system}/k8s/${component}/values-${env}.yaml`;
}

/**
 * ArgoCD app URL for a deployment instance, per the Mozilla convention:
 *   https://<function>.argocd.global.mozgcp.net/applications/argocd-<function>/
 *     <app_code>-<env>-<region>-<chart>?view=tree&resource=
 */
function argoCdUrl(args: {
  functionName: string;
  appCode: string;
  chartName: string;
  envName: string;
  region: string;
}): string {
  const { functionName, appCode, chartName, envName, region } = args;
  const app = `${appCode}-${envName}-${region}-${chartName}`;
  return `https://${functionName}.argocd.global.mozgcp.net/applications/argocd-${functionName}/${app}?view=tree&resource=`;
}

type RealmEnvKey = string;
function realmEnvKey(realm: string, env: string): RealmEnvKey {
  return `${realm} ${env}`;
}

/**
 * Group the flat `deployments[]` into `(realm, environment) -> regions`.
 * Preserves first-seen order so output is deterministic per row.
 */
function groupRealmEnvRegions(
  deployments: ChartDeploymentsRow['deployments'],
): Array<{ realm: string; environment: string; regions: string[] }> {
  const order: RealmEnvKey[] = [];
  const buckets = new Map<
    RealmEnvKey,
    { realm: string; environment: string; regions: string[] }
  >();
  for (const d of deployments) {
    if (!d.realm || !d.environment || !d.region) continue;
    const key = realmEnvKey(d.realm, d.environment);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { realm: d.realm, environment: d.environment, regions: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    if (!bucket.regions.includes(d.region)) bucket.regions.push(d.region);
  }
  return order.map(k => buckets.get(k)!);
}

/**
 * Pure transform: a single chart-deployments row -> the Backstage entities
 * that represent the chart and where it's deployed.
 *
 * Emits:
 *   - 1 Component (helm chart, `type: service`) per row, owned by the
 *     tenant's primary workgroup and attached to the tenant System. Carries
 *     a link to the Helm chart directory in the function's `<function>-infra`
 *     repo, plus (for argocd charts) one ArgoCD link per
 *     `(environment, region)` it is deployed to.
 *   - 1 Component (helm-deployment) per `(realm, environment)` observed in
 *     `deployments[]`, when `deployment_type === 'argocd'`. Carries links to
 *     the Helm chart directory and to that environment's
 *     `values-<environment>.yaml`. The environment's regions are aggregated
 *     into the `mozilla.org/regions` / `mozilla.org/argocd-urls` annotations.
 */
export function chartToEntities(
  row: ChartDeploymentsRow,
  locationRef: string,
): Entity[] {
  const sysName = row.tenant;
  const functionName = row.function;
  const owner = tenantOwner(row.workgroups);
  const componentName = row.chart_name;
  const githubSlug = row.application_repository ?? undefined;
  const autoUpdate =
    row.images.length > 0 ? row.images.some(img => img.auto_update) : undefined;
  const imageAliases = row.images
    .map(img => img.name)
    .filter((n): n is string => Boolean(n));

  const baseAnn = (extra: Record<string, string | undefined> = {}) =>
    pickDefined({
      'backstage.io/managed-by-location': locationRef,
      'backstage.io/managed-by-origin-location': locationRef,
      ...extra,
    });

  const entities: Entity[] = [];

  const isArgo = row.deployment_type === 'argocd';
  const grouped = isArgo ? groupRealmEnvRegions(row.deployments) : [];
  const chartUrl = chartDirUrl(functionName, sysName, componentName);

  // Helm chart link for every chart, plus per-(env, region) ArgoCD links on
  // the service so operators can jump to any environment from one place.
  const serviceLinks: EntityLink[] = [
    { url: chartUrl, title: 'Helm chart', icon: 'github' },
    ...grouped.flatMap(({ environment, regions }) =>
      regions.map(region => ({
        url: argoCdUrl({
          functionName,
          appCode: sysName,
          chartName: row.chart_name,
          envName: environment,
          region,
        }),
        title: `ArgoCD: ${environment} (${region})`,
        icon: 'dashboard',
      })),
    ),
  ];

  entities.push({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: componentName,
      annotations: baseAnn({
        'github.com/project-slug': githubSlug,
        'backstage.io/source-location': githubSlug
          ? `url:https://github.com/${githubSlug}/`
          : undefined,
        'mozilla.org/deployment-type': row.deployment_type ?? undefined,
        'mozilla.org/chart-name': row.chart_name,
        'mozilla.org/release-name': row.release_name ?? undefined,
        'mozilla.org/auto-update':
          autoUpdate === undefined ? undefined : String(autoUpdate),
        'mozilla.org/image-aliases':
          imageAliases.length > 0 ? imageAliases.join(',') : undefined,
        // Grafana dashboard selector so the Grafana dashboards/alerts
        'grafana/dashboard-selector': `tags @> 'app_code=${sysName}' && tags @> 'component_code=${componentName}'`,
        'grafana/alert-label-selector': `app_code=${sysName}, component_code=${componentName}`,
      }),
      links: serviceLinks,
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
      owner,
      system: sysName,
    },
  });

  if (!isArgo) return entities;

  for (const { realm, environment, regions } of grouped) {
    const argoUrls = regions.map(region => ({
      region,
      url: argoCdUrl({
        functionName: functionName,
        appCode: sysName,
        chartName: row.chart_name,
        envName: environment,
        region,
      }),
    }));
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: `${componentName}-${environment}`,
        annotations: baseAnn({
          'mozilla.org/realm': realm,
          'mozilla.org/environment': environment,
          'mozilla.org/regions': regions.join(','),
          'mozilla.org/chart-name': row.chart_name,
          'mozilla.org/argocd-urls': argoUrls
            .map(({ region, url }) => `${region}=${url}`)
            .join('|'),
        }),
        links: [
          { url: chartUrl, title: 'Helm chart', icon: 'github' },
          {
            url: valuesFileUrl(
              functionName,
              sysName,
              componentName,
              environment,
            ),
            title: `Values (${environment})`,
            icon: 'github',
          },
        ],
      },
      spec: {
        type: 'helm-deployment',
        lifecycle: 'production',
        owner,
        subcomponentOf: componentName,
      },
    });
  }

  return entities;
}
