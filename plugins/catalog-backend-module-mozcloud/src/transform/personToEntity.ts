import * as crypto from 'crypto';
import { Entity, EntityLink } from '@backstage/catalog-model';
import { UserRow } from './schema';
import { emailToUserName, pickDefined } from './refs';

/** Backstage namespace for canonical org users sourced from BigQuery. */
export const PEOPLE_NAMESPACE = 'people';

/**
 * Build a Gravatar avatar URL for an email address.
 *
 * SHA-256 of the trimmed, lowercased email → hex digest.
 * Uses the `d=initials` fallback so users without a Gravatar account
 * get a generated initials avatar instead of a broken image.
 */
function gravatarUrl(email: string, name?: string | null): string {
  const hash = crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
  const nameParam = name ? `&name=${encodeURIComponent(name)}` : '';
  return `https://gravatar.com/avatar/${hash}?d=initials&s=256${nameParam}`;
}

/**
 * Build the set of links for a user entity.
 *
 * GitHub link: present when `githubLogin` is provided.
 * People Directory + DAWG links: only for `@mozilla.com` addresses.
 */
function userLinks(email: string, githubLogin?: string | null): EntityLink[] {
  const links: EntityLink[] = [];

  if (githubLogin) {
    links.push({
      url: `https://github.com/${githubLogin}`,
      title: `@${githubLogin} on GitHub`,
      icon: 'github',
    });
  }

  if (email.endsWith('@mozilla.com')) {
    links.push({
      url: `https://people.mozilla.org/s?query=${encodeURIComponent(
        email,
      )}&who=staff`,
      title: 'People Directory Profile',
    });
    links.push({
      url: `https://protosaur.dev/dawg/user/${encodeURIComponent(email)}`,
      title: `${email} on DAWG`,
      icon: 'dawg',
    });
  }

  return links;
}

/**
 * Pure transform: one BigQuery UserRow → one Backstage `User` entity in the
 * `people` namespace.
 *
 * - Name is `emailToUserName(email)` for stable cross-provider refs.
 * - `displayName` comes from the BigQuery `name` field when present; falls
 *   back to the email local-part.
 * - `picture` is always a Gravatar URL derived from the email.
 * - GitHub annotations are set only when the row provides them.
 * - `spec.memberOf` is empty (required by the User schema); membership is
 *   derived from the workgroup Groups' `spec.members`.
 */
export function personToEntity(user: UserRow, locationRef: string): Entity {
  const displayName = user.name?.trim() || '' || user.email.split('@')[0];

  const githubOrgsAnnotation =
    user.github_orgs && user.github_orgs.length > 0
      ? user.github_orgs.join(',')
      : undefined;

  const annotations = pickDefined({
    'backstage.io/managed-by-location': locationRef,
    'backstage.io/managed-by-origin-location': locationRef,
    'mozilla.org/email': user.email,
    'github.com/user-login': user.github_login ?? undefined,
    'github.com/user-id': user.github_node_id ?? undefined,
    'mozilla.org/github-orgs': githubOrgsAnnotation,
  });

  const links = userLinks(user.email, user.github_login);

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: emailToUserName(user.email),
      namespace: PEOPLE_NAMESPACE,
      annotations,
      ...(links.length > 0 ? { links } : {}),
    },
    spec: {
      profile: pickDefined({
        displayName,
        email: user.email,
        picture: gravatarUrl(user.email, user.name),
      }),
      // The User kind schema requires `memberOf`. We leave it empty here:
      // the actual membership relations are derived by the catalog from the
      // workgroup Groups' `spec.members` (which reference these people users).
      memberOf: [],
    },
  };
}
