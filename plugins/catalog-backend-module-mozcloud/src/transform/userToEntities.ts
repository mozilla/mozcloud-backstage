import { createHash } from 'crypto';
import { Entity } from '@backstage/catalog-model';
import { UserRow } from './schema';
import {
  emailToUserName,
  pickDefined,
  subgroupName,
} from './refs';

/**
 * Build a Gravatar image URL for the user's email. When Gravatar has a
 * registered image for the email it serves it; otherwise it renders
 * initials from the `name` parameter (`d=initials`). The identifier is
 * SHA-256 of the trimmed, lowercased email per the current Gravatar SDK
 * conventions (https://docs.gravatar.com/sdk/images/).
 */
function gravatarUrl(email: string, name?: string | null): string {
  const hash = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
  const params = new URLSearchParams({ d: 'initials', s: '256' });
  if (name) params.set('name', name);
  return `https://gravatar.com/avatar/${hash}?${params.toString()}`;
}

/**
 * Pure transform: one user row -> one Backstage User entity (in the
 * `workgroups` namespace). `spec.memberOf` is populated from the row's
 * `memberships[]` — each entry becomes `workgroups/<workgroup>-<subgroup>`
 * (matching `MozcloudWorkgroupEntityProvider`'s subgroup naming).
 *
 * Multiple memberships for the same email are already collapsed onto a
 * single row by `usersQuery`, so this transform doesn't need to dedupe.
 */
export function userToEntities(
  user: UserRow,
  locationRef: string,
): Entity[] {
  const baseAnn = (extra: Record<string, string | undefined> = {}) =>
    pickDefined({
      'backstage.io/managed-by-location': locationRef,
      'backstage.io/managed-by-origin-location': locationRef,
      ...extra,
    });

  const memberOf = user.memberships.map(m =>
    `workgroups/${subgroupName(m.workgroup, m.subgroup)}`,
  );

  return [
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        name: emailToUserName(user.email),
        namespace: 'workgroups',
        annotations: baseAnn({
          'mozilla.org/email': user.email,
          'github.com/user-login': user.github_login ?? undefined,
          'mozilla.org/github-orgs':
            user.github_orgs.length > 0
              ? user.github_orgs.join(',')
              : undefined,
        }),
      },
      spec: {
        profile: {
          email: user.email,
          displayName: user.name ?? user.email.split('@')[0],
          picture: gravatarUrl(user.email, user.name),
        },
        memberOf,
      },
    },
  ];
}
