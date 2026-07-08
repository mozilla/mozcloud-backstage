import { Entity, EntityLink } from '@backstage/catalog-model';
import { Subgroup, WorkgroupRow } from './schema';
import {
  crossWorkgroupRef,
  emailLocalPart,
  pickDefined,
  subgroupName,
  workgroupRef,
} from './refs';

const WORKGROUPS_REPO = 'mozilla/global-platform-admin';
const WORKGROUPS_PATH = 'google-workspace-management/tf/workgroups';
const DAWG_BASE = 'https://protosaur.dev/dawg/workgroup';
const GCP_DOMAIN = '@firefox.gcp.mozilla.com';

/** Local-parts of a subgroup's `@firefox.gcp.mozilla.com` user members. */
function gcpMemberLocalParts(sub: Subgroup): string[] {
  return (sub.members ?? [])
    .filter(m => m.toLowerCase().endsWith(GCP_DOMAIN))
    .map(emailLocalPart);
}

/** A `user:gcp/<localpart>` User entity for a gcp IAM human identity. */
function gcpUserEntity(localPart: string, locationRef: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: localPart,
      namespace: 'gcp',
      annotations: pickDefined({
        'backstage.io/managed-by-location': locationRef,
        'backstage.io/managed-by-origin-location': locationRef,
        'mozilla.org/email': `${localPart}${GCP_DOMAIN}`,
      }),
    },
    spec: { memberOf: [] },
  };
}

/** Source-location URL for a workgroup's YAML in the upstream repo. */
function workgroupSourceLocation(workgroup: string): string {
  return `url:https://github.com/${WORKGROUPS_REPO}/blob/main/${WORKGROUPS_PATH}/${workgroup}.yaml`;
}

/** DAWG (Domain Access Workgroup Governance) page for a workgroup. */
function dawgUrl(workgroup: string, subgroup?: string): string {
  const base = `${DAWG_BASE}/${workgroup}`;
  return subgroup ? `${base}#${subgroup}` : base;
}

/**
 * External links for a workgroup or subgroup. Takes the same positional
 * args as {@link dawgUrl} so the caller does the unpacking.
 */
function workgroupLinks(workgroup: string, subgroup?: string): EntityLink[] {
  return [
    { url: dawgUrl(workgroup, subgroup), title: 'View on DAWG', icon: 'dawg' },
    {
      url: workgroupSourceLocation(workgroup),
      title: 'View source on Github',
      icon: 'github',
    },
  ];
}

/**
 * Pure transform: a single workgroup row -> the Group (and gcp User)
 * entities that represent it.
 *
 * Emits, for each workgroup:
 *   - 1 parent Group         (group:workgroups/<workgroup>)
 *   - N subgroup Groups      (group:workgroups/<workgroup>-<subname>)
 *   - 1 `user:gcp/<localpart>` User per `@firefox.gcp.mozilla.com` IAM
 *     identity found in a subgroup's `members` list.
 *
 * People `User` entities are NOT emitted here — MozcloudPeopleEntityProvider
 * owns those (in the `people` namespace), and the workgroup provider fills
 * each subgroup's `spec.members` with `user:people/…` refs built from the
 * users source, merged with the `user:gcp/…` refs emitted below.
 */
export function workgroupToEntities(
  wg: WorkgroupRow,
  locationRef: string,
): Entity[] {
  const entities: Entity[] = [];
  const baseAnn = (extra: Record<string, string | undefined> = {}) =>
    pickDefined({
      'backstage.io/managed-by-location': locationRef,
      'backstage.io/managed-by-origin-location': locationRef,
      ...extra,
    });

  const parentName = wg.workgroup;
  const childRefs = wg.subgroups.map(sub =>
    crossWorkgroupRef(`${wg.workgroup}/${sub.name}`),
  );

  entities.push({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name: parentName,
      namespace: 'workgroups',
      annotations: baseAnn({
        // Link Group entity pages back to the canonical workgroup YAML
        // upstream (BackstageHeader picks this up for the "View source"
        // affordance via the AboutCard / EntityLinksCard).
        'backstage.io/source-location': workgroupSourceLocation(wg.workgroup),
        'mozilla.org/sponsor': wg.sponsor,
        'mozilla.org/tickets': wg.tickets.join(','),
        'mozilla.org/managers': wg.managers.join(','),
      }),
      links: workgroupLinks(wg.workgroup),
    },
    spec: {
      type: 'workgroup',
      profile: pickDefined({ email: wg.sponsor }),
      children: childRefs,
      members: [],
    },
  });

  for (const sub of wg.subgroups) {
    entities.push(subgroupToEntity(sub, locationRef));
  }

  // Emit user:gcp entities for gcp IAM human identities found in any
  // subgroup's members. Deduping is unnecessary here — the provider
  // dedupes globally across all workgroups.
  for (const sub of wg.subgroups) {
    for (const lp of gcpMemberLocalParts(sub)) {
      entities.push(gcpUserEntity(lp, locationRef));
    }
  }

  return entities;
}

function subgroupToEntity(sub: Subgroup, locationRef: string): Entity {
  const name = subgroupName(sub.parent, sub.name);
  // Cross-workgroup composition lives only in the annotation, not in
  // any spec field that the catalog processor turns into a relation.
  // Putting these refs into `spec.children` would create `parentOf`
  // relations and cause stock member-aggregation walkers (e.g.
  // `@backstage/plugin-org`'s `MembersListCard` "Include subgroups"
  // mode) to descend into the composed-from workgroups, which would
  // conflate "members of this workgroup" with "members of workgroups
  // we've borrowed access from". `spec.dependsOn` would dodge that walk
  // but its semantics ("service A depends on service B") don't fit
  // group composition, so it'd be misleading to readers. If we ever
  // want the composition rendered on the relations graph natively,
  // it should be via a custom relation type from a catalog processor.
  const composedFrom = (sub.workgroups ?? []).map(crossWorkgroupRef);

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name,
      namespace: 'workgroups',
      annotations: pickDefined({
        'backstage.io/managed-by-location': locationRef,
        'backstage.io/managed-by-origin-location': locationRef,
        // Subgroups are defined inline within the parent workgroup's
        // YAML, so they share the same source-location.
        'backstage.io/source-location': workgroupSourceLocation(sub.parent),
        'mozilla.org/composed-from': composedFrom.join(','),
        'mozilla.org/google-groups':
          (sub.google_groups ?? []).join(',') || undefined,
        'mozilla.org/service-accounts':
          (sub.service_accounts ?? []).join(',') || undefined,
        'mozilla.org/iam-principals':
          (sub.members ?? []).join(',') || undefined,
      }),
      links: workgroupLinks(sub.parent, sub.name),
    },
    spec: {
      type: 'workgroup-subgroup',
      profile: { displayName: `${sub.parent} / ${sub.name}` },
      parent: `workgroups/${sub.parent}`,
      children: (sub.workgroups ?? []).map(workgroupRef),
      // `spec.members` starts with this subgroup's own gcp IAM identity
      // members; the provider merges in `user:people/…` refs from the
      // users source on top of these.
      members: gcpMemberLocalParts(sub).map(lp => `user:gcp/${lp}`),
    },
  };
}
