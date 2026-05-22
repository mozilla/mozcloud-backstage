import { Entity } from '@backstage/catalog-model';
import { Subgroup, WorkgroupRow } from './schema';
import { crossWorkgroupRef, pickDefined, subgroupName } from './refs';

/**
 * Pure transform: a single workgroup row -> the Group entities that
 * represent it.
 *
 * Emits, for each workgroup:
 *   - 1 parent Group         (group:workgroups/<workgroup>)
 *   - N subgroup Groups      (group:workgroups/<workgroup>-<subname>)
 *
 * User entities are NOT emitted here — `userToEntities` (fed by
 * `usersQuery`) owns those. The provider merges User.spec.memberOf back
 * into each subgroup's `spec.members` so Group entity pages still list
 * their human members.
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
        'mozilla.org/sponsor': wg.sponsor,
        'mozilla.org/tickets': wg.tickets.join(','),
        'mozilla.org/managers': wg.managers.join(','),
      }),
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
        'mozilla.org/composed-from': composedFrom.join(','),
        'mozilla.org/google-groups':
          (sub.google_groups ?? []).join(',') || undefined,
        'mozilla.org/service-accounts':
          (sub.service_accounts ?? []).join(',') || undefined,
      }),
    },
    spec: {
      type: 'workgroup-subgroup',
      profile: { displayName: `${sub.parent} / ${sub.name}` },
      parent: `workgroups/${sub.parent}`,
      children: [],
      // `spec.members` is populated by the provider from the users
      // source — keep this empty so the old (now incorrect) behavior
      // of treating `sub.members` as user emails is gone.
      members: [],
    },
  };
}
