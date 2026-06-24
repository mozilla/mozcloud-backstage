import { Entity } from '@backstage/catalog-model';
import { PersonProfileRow } from './schema';
import { emailToUserName, pickDefined } from './refs';

/** Backstage namespace for canonical org users sourced from the Person API. */
export const PEOPLE_NAMESPACE = 'people';

/**
 * Flatten a raw CIS Person API profile. Each top-level field arrives wrapped
 * as `{ value, signature, metadata }` (or `{ values, ... }`); we keep just the
 * underlying value. Fields without a `value`/`values` key (nested structures
 * we don't consume, e.g. `staff_information`) are passed through untouched.
 */
export function unwrapCisProfile(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, node] of Object.entries(raw)) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const obj = node as Record<string, unknown>;
      if ('value' in obj) {
        out[key] = obj.value;
        continue;
      }
      if ('values' in obj) {
        out[key] = obj.values;
        continue;
      }
    }
    out[key] = node;
  }
  return out;
}

/**
 * Pure transform: one unwrapped CIS profile -> one Backstage `User` entity in
 * the `people` namespace. The name is `emailToUserName(primary_email)` so the
 * workgroup provider can reference it from email-keyed membership data.
 * `mozilla.org/user-id` carries the CIS `user_id` (== Auth0 `sub`) for the
 * future SSO resolver. No `spec.memberOf` — membership is derived from Group
 * `spec.members`.
 */
export function personToEntity(
  row: PersonProfileRow,
  locationRef: string,
): Entity {
  const fullName = [row.first_name, row.last_name]
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .trim();
  const displayName =
    fullName || row.primary_username || row.primary_email.split('@')[0];

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: emailToUserName(row.primary_email),
      namespace: PEOPLE_NAMESPACE,
      annotations: pickDefined({
        'backstage.io/managed-by-location': locationRef,
        'backstage.io/managed-by-origin-location': locationRef,
        'mozilla.org/email': row.primary_email,
        'mozilla.org/username': row.primary_username ?? undefined,
        'mozilla.org/user-id': row.user_id,
      }),
    },
    spec: {
      profile: pickDefined({
        displayName,
        email: row.primary_email,
        picture: row.picture ?? undefined,
      }),
    },
  };
}
