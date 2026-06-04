import { Entity } from '@backstage/catalog-model';
import { TenantRow } from './schema';
import { pickDefined, tenantOwner, workgroupRef, DEFAULT_WG_REF } from './refs';

const TENANTS_REPO = 'mozilla/global-platform-admin';

/** Build the source-location URL for a tenant's YAML in the upstream repo. */
function tenantSourceLocation(appCode: string): string {
  return `url:https://github.com/${TENANTS_REPO}/blob/main/tenants/${appCode}.yaml`;
}

/**
 * Pure transform: a single tenant row -> the Backstage entities that
 * represent it.
 *
 * Emits:
 *   - 1 Domain (the tenant's function — webservices/dataservices/sandbox/etc.)
 *   - 1 System (the tenant)
 *   - 1 Resource per realm with a project_id (gcp-project)
 *   - 1 Resource per entry in globals.entitlements.additional_entitlements
 *
 * Chart Components (helm charts + helm-deployments) are NOT emitted here —
 * the `chartToEntities` transform owns those, fed by `chartsDeploymentsQuery`.
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

  // Default annotations for all entities
  const baseAnn = (extra: Record<string, string | undefined> = {}) =>
    pickDefined({
      'backstage.io/managed-by-location': locationRef,
      'backstage.io/managed-by-origin-location': locationRef,
      ...extra,
    });

  entities.push({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Domain',
    metadata: {
      name: fn,
      annotations: baseAnn({
        'backstage.io/source-location': `url:https://github.com/mozilla/${fn}-infra`,
      }),
    },
    spec: { owner: DEFAULT_WG_REF },
  });

  // Each tenant represents a 'System' in backstage
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
        'grafana/dashboard-selector': `tags @> 'app_code=${sysName}'`,
        'grafana/alert-label-selector': `app_code=${sysName}`,
      }),
    },
    spec: { owner, domain: tenant.globals.function },
  });

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
        name: `${sysName}-entitlement-${ent.name}`,
        annotations: baseAnn(),
      },
      spec: {
        type: 'gcp-entitlement',
        owner,
        system: sysName,
        // TODO add part of ref to prod realm project id or nonprod if prod is not present
        dependsOn: ent.principals.map(workgroupRef),
      },
    });
  }

  return entities;
}
