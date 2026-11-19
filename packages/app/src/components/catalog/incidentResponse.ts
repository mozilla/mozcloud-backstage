import { Entity } from '@backstage/catalog-model';

export const splitCsv = (s?: string) =>
  (s ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

export const slackChannelUrl = (id: string) =>
  `https://mozilla.slack.com/archives/${id}`;

export const pagerDutyServiceUrl = (id: string) =>
  `https://mozilla.pagerduty.com/service-directory/${id}`;

export interface IncidentFields {
  sponsor?: string;
  managers: string[];
  slackUrl?: string;
  pagerDutyUrl?: string;
}

/**
 * Reads the escalation values for a System page. The System annotations are
 * written by the tenant transform (see `INCIDENT_ANNOTATIONS` in
 * plugins/catalog-backend-module-mozcloud/src/transform/incident.ts, which
 * also validates their format); sponsor and managers live on the owner Group.
 */
export function readIncidentFields(
  system: Entity,
  owner?: Entity,
): IncidentFields {
  const sys = system.metadata.annotations ?? {};
  const grp = owner?.metadata.annotations ?? {};
  const slackId = sys['mozilla.org/escalation-slack-channel-id'];
  const pagerDutyId = sys['pagerduty.com/service-id'];

  return {
    sponsor: grp['mozilla.org/sponsor'] || undefined,
    managers: splitCsv(grp['mozilla.org/managers']),
    slackUrl: slackId ? slackChannelUrl(slackId) : undefined,
    pagerDutyUrl: pagerDutyId ? pagerDutyServiceUrl(pagerDutyId) : undefined,
  };
}
