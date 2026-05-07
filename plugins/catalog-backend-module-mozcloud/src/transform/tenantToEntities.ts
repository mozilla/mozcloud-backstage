import { Entity } from '@backstage/catalog-model';
import { TenantRow } from './schema';
import {
  chartComponentName,
  pickDefined,
  tenantOwner,
  workgroupRef,
} from './refs';

/**
 * Pure transform: a single tenant row -> the Backstage entities that
 * represent it.
 *
 * Emits:
 *   - 1 Domain (the tenant's function — webservices/dataservices/sandbox/etc.)
 *   - 1 System (the tenant)
 *   - 1 Component per chart in globals.deployment.charts
 *   - 1 Resource per realm with a project_id (gcp-project)
 *   - 1 Resource per entry in globals.entitlements.additional_entitlements
 *   - 1 Group shell per referenced workgroup (in the `workgroups` namespace)
 *
 * Domain and Group entities deduplicate at the provider level — many
 * tenants share the same function and the same workgroups.
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

  // Domain: spec.owner is required; the function category spans teams,
  // so fall back to a stable placeholder rather than picking one arbitrarily.
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
  for (const [chartName, chart] of charts) {
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: chartComponentName(sysName, chartName, charts.length),
        annotations: baseAnn({
          'github.com/project-slug': chart.application_repository,
          'mozilla.org/deployment-type': tenant.globals.deployment?.type,
        }),
      },
      spec: {
        type: 'service',
        lifecycle: 'production',
        owner,
        system: sysName,
      },
    });
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

  for (const wg of tenant.globals.workgroups ?? []) {
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: wg,
        namespace: 'workgroups',
        annotations: baseAnn(),
      },
      spec: { type: 'workgroup', children: [], members: [] },
    });
  }

  return entities;
}
