import { Entity } from '@backstage/catalog-model';
import { Subgroup, WorkgroupRow } from './schema';
import {
  crossWorkgroupRef,
  emailToUserName,
  pickDefined,
  subgroupName,
  userRef,
} from './refs';

/**
 * Pure transform: a single workgroup YAML -> the Backstage entities.
 *
 * Emits, for each workgroup:
 *   - 1 parent Group         (group:workgroups/<workgroup>)
 *   - N subgroup Groups      (group:workgroups/<workgroup>-<subname>)
 *   - 1 User per member email (user:workgroups/<sanitized-email>)
 *
 * Users emitted by this function are deduplicated and have their
 * `spec.memberOf` unioned at the provider level — a single email may
 * appear in multiple subgroups across multiple workgroups, and we want
 * one User entity that reflects every membership.
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
  // Backstage ownership relations are direct, not transitive through the
  // Group hierarchy. A System owned by `group:workgroups/fxa` will only
  // surface as "owned" for users whose `memberOf` includes that exact ref.
  // To propagate ownership down to humans, the parent workgroup lists the
  // union of every subgroup's members directly. The merge phase in the
  // provider then writes that membership back onto each User's `memberOf`.
  const parentMembers = collectMemberEmails(wg).map(userRef);

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
      members: parentMembers,
    },
  });

  for (const sub of wg.subgroups) {
    entities.push(subgroupToEntity(wg, sub, locationRef));
  }

  for (const email of collectMemberEmails(wg)) {
    entities.push(memberToUserEntity(email, locationRef));
  }

  return entities;
}

function subgroupToEntity(
  wg: WorkgroupRow,
  sub: Subgroup,
  locationRef: string,
): Entity {
  const name = subgroupName(wg.workgroup, sub.name);
  const memberRefs = (sub.members ?? []).map(userRef);
  // Cross-workgroup composition refs become "children" so the relations
  // graph shows the included groups; the natural workgroup -> subgroup
  // hierarchy is preserved by `spec.parent`.
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
      profile: { displayName: `${wg.workgroup} / ${sub.name}` },
      parent: `workgroups/${wg.workgroup}`,
      children: composedFrom,
      members: memberRefs,
    },
  };
}

function memberToUserEntity(email: string, locationRef: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: emailToUserName(email),
      namespace: 'workgroups',
      annotations: pickDefined({
        'backstage.io/managed-by-location': locationRef,
        'backstage.io/managed-by-origin-location': locationRef,
        'mozilla.org/email': email,
      }),
    },
    spec: {
      profile: {
        email,
        displayName: email.split('@')[0],
      },
      memberOf: [],
    },
  };
}

/** Unique member emails across all subgroups, preserving first-seen order. */
function collectMemberEmails(wg: WorkgroupRow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sub of wg.subgroups ?? []) {
    for (const email of sub.members ?? []) {
      if (seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
