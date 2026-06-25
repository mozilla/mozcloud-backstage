import * as crypto from 'crypto';
import { Entity, EntityLink } from '@backstage/catalog-model';
import { PersonRosterRow } from './schema';
import { emailToUserName, pickDefined } from './refs';

/** Backstage namespace for canonical org users sourced from the Person API. */
export const PEOPLE_NAMESPACE = 'people';

/** GitHub identity and display name from the BigQuery users table. */
export interface GithubEnrichment {
  name?: string | null;
  githubLogin?: string | null;
  githubNodeId?: string | null;
  githubOrgs?: string[];
}

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
 * Pure transform: one roster row + optional BigQuery enrichment → one
 * Backstage `User` entity in the `people` namespace.
 *
 * - Name is `emailToUserName(primary_email)` for stable cross-provider refs.
 * - `displayName` comes from the BigQuery `name` field when present; falls
 *   back to the email local-part.
 * - `picture` is always a Gravatar URL derived from the email.
 * - GitHub annotations are set only when enrichment provides them.
 * - No `spec.memberOf` — membership is derived from Group `spec.members`.
 */
export function personToEntity(
  row: PersonRosterRow,
  enrichment: GithubEnrichment | undefined,
  locationRef: string,
): Entity {
  const displayName =
    (enrichment?.name?.trim() ?? '') || row.primary_email.split('@')[0];

  const githubOrgsAnnotation =
    enrichment?.githubOrgs && enrichment.githubOrgs.length > 0
      ? enrichment.githubOrgs.join(',')
      : undefined;

  const annotations = pickDefined({
    'backstage.io/managed-by-location': locationRef,
    'backstage.io/managed-by-origin-location': locationRef,
    'mozilla.org/email': row.primary_email,
    'mozilla.org/user-id': row.user_id,
    ...(enrichment?.githubLogin
      ? { 'github.com/user-login': enrichment.githubLogin }
      : {}),
    ...(enrichment?.githubNodeId
      ? { 'github.com/user-id': enrichment.githubNodeId }
      : {}),
    ...(githubOrgsAnnotation
      ? { 'mozilla.org/github-orgs': githubOrgsAnnotation }
      : {}),
  });

  const links = userLinks(row.primary_email, enrichment?.githubLogin);

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: emailToUserName(row.primary_email),
      namespace: PEOPLE_NAMESPACE,
      annotations,
      ...(links.length > 0 ? { links } : {}),
    },
    spec: {
      profile: {
        displayName,
        email: row.primary_email,
        picture: gravatarUrl(row.primary_email, enrichment?.name),
      },
    },
  };
}
