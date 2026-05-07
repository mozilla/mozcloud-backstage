import { Entity } from '@backstage/catalog-model';
import { TenantRow } from './schema';
import {
  chartComponentName,
  pickDefined,
  tenantOwner,
  workgroupRef,
} from './refs';

const TENANTS_REPO = 'mozilla-services/global-platform-admin';
const DEFAULT_REGION = 'us-west1';

/** Build the source-location URL for a tenant's YAML in the upstream repo. */
function tenantSourceLocation(appCode: string): string {
  return `url:https://github.com/${TENANTS_REPO}/blob/main/tenants/${appCode}.yaml`;
}

/** All regions a chart in `additional_regions` deploys to (us-west1 is default). */
function chartRegions(tenant: TenantRow): string[] {
  const additional = (tenant.globals as { additional_regions?: string[] })
    .additional_regions;
  return [DEFAULT_REGION, ...(additional ?? [])];
}

/**
 * ArgoCD app URL for a deployment instance, per the Mozilla convention:
 *   https://<function>.argocd.global.mozgcp.net/applications/argocd-<function>/
 *     <app_code>-<env>-<region>-<chart>?view=tree&resource=
 */
function argoCdUrl(args: {
  fn: string;
  appCode: string;
  chartName: string;
  envName: string;
  region: string;
}): string {
  const { fn, appCode, chartName, envName, region } = args;
  const app = `${appCode}-${envName}-${region}-${chartName}`;
  return `https://${fn}.argocd.global.mozgcp.net/applications/argocd-${fn}/${app}?view=tree&resource=`;
}

/**
 * Pure transform: a single tenant row -> the Backstage entities that
 * represent it.
 *
 * Emits:
 *   - 1 Domain (the tenant's function — webservices/dataservices/sandbox/etc.)
 *   - 1 System (the tenant)
 *   - 1 Component per chart in globals.deployment.charts
 *   - 1 Component (helm-deployment) per chart × realm × environment, when
 *     deployment.type is `argocd`. Carries ArgoCD URLs as annotations.
 *   - 1 Resource per realm with a project_id (gcp-project)
 *   - 1 Resource per entry in globals.entitlements.additional_entitlements
 *
 * Workgroup-namespaced Group entities are NOT emitted here — the
 * MozcloudWorkgroupEntityProvider owns that namespace.
 */
export function tenantToEntities(
  tenant: TenantRow,
  locationRef: string,
): Entity[] {
  const sysName = tenant.globals.app_code;
  const owner = tenantOwner(tenant.globals.workgroups);
  const fn = tenant.globals.function;
  const entities: Entity[] = [];

  const baseAnn = (extra: Record<string, string | undefined> = {}) =>
    pickDefined({
      'backstage.io/managed-by-location': locationRef,
      'backstage.io/managed-by-origin-location': locationRef,
      ...extra,
    });

  entities.push({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Domain',
    metadata: { name: fn, annotations: baseAnn() },
    spec: { owner: 'group:default/unowned' },
  });

  entities.push({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: sysName,
      tags: [
        tenant.globals.function,
        `risk-${tenant.globals.risk_level}`,
      ].filter((t): t is string => Boolean(t)),
      annotations: baseAnn({
        // Link System pages back to the canonical tenant YAML upstream.
        'backstage.io/source-location': tenantSourceLocation(sysName),
        'mozilla.org/risk-level': tenant.globals.risk_level,
        'mozilla.org/function': tenant.globals.function,
        'mozilla.org/risk-uuid': tenant.globals.risk_uuid,
        'mozilla.org/cluster-type': tenant.globals.cluster_type,
        'mozilla.org/slack-channel': tenant.globals.slack_channel,
      }),
    },
    spec: { owner, domain: tenant.globals.function },
  });

  const charts = Object.entries(tenant.globals.deployment?.charts ?? {});
  const deploymentType = tenant.globals.deployment?.type;
  const regions = chartRegions(tenant);

  for (const [chartName, chart] of charts) {
    const slug = chart.application_repository;
    const componentName = chartComponentName(sysName, chartName, charts.length);
    const images = (
      chart as { images?: Record<string, { auto_update?: boolean }> }
    ).images;
    const autoUpdate = images
      ? Object.values(images).some(img => img?.auto_update)
      : undefined;

    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: componentName,
        annotations: baseAnn({
          'github.com/project-slug': slug,
          'backstage.io/source-location': slug
            ? `url:https://github.com/${slug}/`
            : undefined,
          'mozilla.org/deployment-type': deploymentType,
          'mozilla.org/chart-name': chartName,
          'mozilla.org/release-name': (chart as { release_name?: string })
            .release_name,
          'mozilla.org/target-revision': (chart as { target_revision?: string })
            .target_revision,
          'mozilla.org/auto-update':
            autoUpdate === undefined ? undefined : String(autoUpdate),
          'mozilla.org/image-aliases': images
            ? Object.keys(images).join(',') || undefined
            : undefined,
        }),
      },
      spec: {
        type: 'service',
        lifecycle: 'production',
        owner,
        system: sysName,
      },
    });

    // Deployment sub-Components: only meaningful for argocd deployments,
    // since the URL convention is ArgoCD-specific.
    if (deploymentType !== 'argocd') continue;

    for (const [realmName, realm] of Object.entries(tenant.realms ?? {})) {
      for (const env of realm?.environments ?? []) {
        if (!env?.name) continue;
        const argoUrls = regions.map(region => ({
          region,
          url: argoCdUrl({
            fn,
            appCode: sysName,
            chartName,
            envName: env.name,
            region,
          }),
        }));
        entities.push({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: `${componentName}-${env.name}`,
            annotations: baseAnn({
              'mozilla.org/realm': realmName,
              'mozilla.org/environment': env.name,
              'mozilla.org/regions': regions.join(','),
              'mozilla.org/chart-name': chartName,
              // The card looks for these argocd-* annotations to render
              // one link per region. Joined into a single annotation
              // value because Backstage annotations are scalar.
              'mozilla.org/argocd-urls': argoUrls
                .map(({ region, url }) => `${region}=${url}`)
                .join('|'),
            }),
          },
          spec: {
            type: 'helm-deployment',
            lifecycle: 'production',
            owner,
            system: sysName,
            subcomponentOf: componentName,
          },
        });
      }
    }
  }

  for (const [realmName, realm] of Object.entries(tenant.realms ?? {})) {
    if (!realm?.project_id) continue;
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: realm.project_id,
        annotations: baseAnn({
          'mozilla.org/realm': realmName,
          'mozilla.org/environments': realm.environments
            ?.map(e => e.name)
            .join(','),
        }),
      },
      spec: { type: 'gcp-project', owner, system: sysName },
    });
  }

  for (const ent of tenant.globals.entitlements?.additional_entitlements ??
    []) {
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: `${sysName}-ent-${ent.name}`,
        annotations: baseAnn(),
      },
      spec: {
        type: 'gcp-entitlement',
        owner,
        system: sysName,
        dependsOn: ent.principals.map(workgroupRef),
      },
    });
  }

  return entities;
}
