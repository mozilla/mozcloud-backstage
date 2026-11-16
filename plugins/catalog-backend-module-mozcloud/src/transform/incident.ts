import { EntityLink } from '@backstage/catalog-model';

/** Catalog annotation keys that the tenant's `globals.ops` fields map to. */
export const INCIDENT_ANNOTATIONS = {
  pagerdutyServiceId: 'pagerduty.com/service-id',
  escalationSlackChannelId: 'mozilla.org/escalation-slack-channel-id',
  runbook: 'mozilla.org/runbook',
  confluenceUrl: 'mozilla.org/confluence-url',
  issueTrackerUrl: 'mozilla.org/issue-tracker-url',
} as const;

export type IncidentAnnotationKey =
  (typeof INCIDENT_ANNOTATIONS)[keyof typeof INCIDENT_ANNOTATIONS];

export const INCIDENT_ANNOTATION_KEYS = Object.values(INCIDENT_ANNOTATIONS);

// These patterns mirror the `Ops` and `Escalation` definitions in
// tenants/schema.json (mozilla/global-platform-admin), so a value that passes
// the tenant CI is never dropped here.
const HTTPS_URL = /^https:\/\//;
const SLACK_CHANNEL_ID = /^[CG][A-Z0-9]+$/;
const PAGERDUTY_SERVICE_ID = /^[A-Z0-9]+$/;

const PATTERNS: Record<IncidentAnnotationKey, RegExp> = {
  [INCIDENT_ANNOTATIONS.pagerdutyServiceId]: PAGERDUTY_SERVICE_ID,
  [INCIDENT_ANNOTATIONS.escalationSlackChannelId]: SLACK_CHANNEL_ID,
  [INCIDENT_ANNOTATIONS.runbook]: HTTPS_URL,
  [INCIDENT_ANNOTATIONS.confluenceUrl]: HTTPS_URL,
  [INCIDENT_ANNOTATIONS.issueTrackerUrl]: HTTPS_URL,
};

/** Whether `value` is a string in the format the annotation `key` expects. */
export function isValidIncidentValue(
  key: IncidentAnnotationKey,
  value: unknown,
): value is string {
  return typeof value === 'string' && PATTERNS[key].test(value);
}

interface IncidentField {
  /** Where the field sits: directly under `ops`, or under `ops.escalation`. */
  scope: 'ops' | 'escalation';
  name: string;
  annotation: IncidentAnnotationKey;
  /** Set for URL fields, which also get an entry on the Links card. */
  link?: Pick<EntityLink, 'title' | 'icon'>;
}

// Listed in link order: links are emitted in the order of this table.
const FIELDS: IncidentField[] = [
  {
    scope: 'escalation',
    name: 'pagerduty_service_id',
    annotation: INCIDENT_ANNOTATIONS.pagerdutyServiceId,
  },
  {
    scope: 'escalation',
    name: 'slack_channel_id',
    annotation: INCIDENT_ANNOTATIONS.escalationSlackChannelId,
  },
  {
    scope: 'ops',
    name: 'runbooks_url',
    annotation: INCIDENT_ANNOTATIONS.runbook,
    link: { title: 'Runbooks', icon: 'docs' },
  },
  {
    scope: 'ops',
    name: 'confluence_url',
    annotation: INCIDENT_ANNOTATIONS.confluenceUrl,
    link: { title: 'Confluence', icon: 'docs' },
  },
  {
    scope: 'ops',
    name: 'issue_tracker_url',
    annotation: INCIDENT_ANNOTATIONS.issueTrackerUrl,
    link: { title: 'Report an issue', icon: 'help' },
  },
];

export interface Incident {
  annotations: Partial<Record<IncidentAnnotationKey, string>>;
  links: EntityLink[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read a tenant's `globals.ops` into annotations and links, leaf by leaf.
 *
 * The input is whatever BigQuery handed us, so nothing is assumed about its
 * shape: a missing or null value is unset, and anything malformed (a wrong
 * type, a value that fails its format) drops only that field and is reported
 * through `onProblem` with its path, for example `ops.escalation.slack_channel_id`.
 */
export function readIncident(
  ops: unknown,
  onProblem: (path: string, reason: string) => void = () => {},
): Incident {
  const incident: Incident = { annotations: {}, links: [] };
  if (ops === undefined || ops === null) return incident;
  if (!isPlainObject(ops)) {
    onProblem('ops', 'expected an object');
    return incident;
  }

  let escalation: Record<string, unknown> | undefined;
  if (ops.escalation !== undefined && ops.escalation !== null) {
    if (isPlainObject(ops.escalation)) {
      escalation = ops.escalation;
    } else {
      onProblem('ops.escalation', 'expected an object');
    }
  }

  for (const { scope, name, annotation, link } of FIELDS) {
    const value = (scope === 'ops' ? ops : escalation)?.[name];
    if (value === undefined || value === null) continue;

    if (!isValidIncidentValue(annotation, value)) {
      const path = scope === 'ops' ? `ops.${name}` : `ops.escalation.${name}`;
      onProblem(
        path,
        typeof value === 'string'
          ? 'does not match the expected format'
          : 'expected a string',
      );
      continue;
    }

    incident.annotations[annotation] = value;
    if (link) incident.links.push({ url: value, ...link });
  }
  return incident;
}
