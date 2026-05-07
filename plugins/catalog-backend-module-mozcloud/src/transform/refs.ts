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
  if (!wg) return 'group:workgroups/unknown';
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
