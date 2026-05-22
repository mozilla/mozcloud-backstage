export const DEFAULT_WG_REF = 'group:workgroups/platform';
/**
 * Convert a tenant entitlement principal like `workgroup:fxa/developers`
 * into a Backstage entity ref like `group:workgroups/fxa-developers`.
 *
 * The `workgroups` namespace keeps these Groups from colliding with the
 * GitHub Org provider's Groups in the default namespace.
 */
export function workgroupRef(principal: string): string {
  const stripped = principal.replace(/^workgroup:/, '');
  const [wg, sub] = stripped.split('/');
  if (!wg) return DEFAULT_WG_REF;
  const name = sub ? `${wg}-${sub}` : wg;
  return `group:workgroups/${name}`;
}

/**
 * Owner ref for a tenant, derived from the first workgroup. Falls back to
 * `group:default/unowned` if the tenant has no workgroups (shouldn't happen
 * — the schema marks it required — but defensive coding).
 */
export function tenantOwner(workgroups: string[] | undefined): string {
  const primary = workgroups?.[0];
  return primary ? `group:workgroups/${primary}` : 'group:default/unowned';
}

/**
 * Component name for a chart inside a tenant.
 *
 * Single-chart tenants use the app_code as the component name (so
 * `system:default/backstage` has a `component:default/backstage`). Multi-chart
 * tenants get suffixed names (`socorro-antenna`, `socorro-socorro`) to
 * disambiguate.
 */
export function chartComponentName(
  appCode: string,
  chartName: string,
  chartCount: number,
): string {
  return chartCount === 1 ? appCode : `${appCode}-${chartName}`;
}

/**
 * Drop keys whose values are undefined or empty string. Useful for building
 * annotation maps where unset upstream fields shouldn't appear.
 */
export function pickDefined<T extends Record<string, string | undefined>>(
  obj: T,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

/**
 * Backstage entity name for a workgroup subgroup.
 * `<workgroup>-<subname>` keeps things unique across the `workgroups`
 * namespace.
 */
export function subgroupName(workgroup: string, sub: string): string {
  return `${workgroup}-${sub}`;
}

/**
 * Sanitize a Mozilla email into a Backstage entity name. Backstage names
 * allow `[a-zA-Z0-9._-]`, but for consistent dashed names we replace `.`
 * along with `@` and any other non-alphanumeric chars. Examples:
 *   alice@mozilla.com               -> alice-mozilla-com
 *   alice@firefox.gcp.mozilla.com   -> alice-firefox-gcp-mozilla-com
 *   first.last@mozilla.com          -> first-last-mozilla-com
 *
 * Including the domain in the name avoids collisions between users with
 * the same local-part across different Mozilla email domains.
 */
export function emailToUserName(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Backstage entity ref for a workgroup user (namespace = workgroups).
 * Users in this namespace are distinct from the GitHub Org provider's
 * users in the default namespace.
 */
export function userRef(email: string): string {
  return `user:workgroups/${emailToUserName(email)}`;
}

/**
 * Resolve a cross-workgroup reference like `sre/admins` (as it appears
 * in subgroup composition) into a Backstage Group entity ref.
 */
export function crossWorkgroupRef(ref: string): string {
  const [wg, sub] = ref.split('/');
  if (!sub) return `group:workgroups/${wg}`;
  return `group:workgroups/${subgroupName(wg, sub)}`;
}
