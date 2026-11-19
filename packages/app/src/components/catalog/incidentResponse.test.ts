import { Entity } from '@backstage/catalog-model';
import {
  pagerDutyServiceUrl,
  readIncidentFields,
  slackChannelUrl,
  splitCsv,
} from './incidentResponse';

const system = (annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'testapp', annotations },
  spec: { owner: 'group:workgroups/testapp' },
});

const group = (annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name: 'testapp', namespace: 'workgroups', annotations },
  spec: { type: 'workgroup' },
});

describe('splitCsv', () => {
  it('trims entries and drops empty ones', () => {
    expect(splitCsv(' a@mozilla.com, ,b@mozilla.com,')).toEqual([
      'a@mozilla.com',
      'b@mozilla.com',
    ]);
  });

  it('returns an empty list for undefined or empty input', () => {
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv('')).toEqual([]);
  });
});

describe('link builders', () => {
  it('builds the Slack channel URL from a channel ID', () => {
    expect(slackChannelUrl('C0123456789')).toBe(
      'https://mozilla.slack.com/archives/C0123456789',
    );
  });

  it('builds the PagerDuty service URL from a service ID', () => {
    expect(pagerDutyServiceUrl('PABC123')).toBe(
      'https://mozilla.pagerduty.com/service-directory/PABC123',
    );
  });
});

describe('readIncidentFields', () => {
  it('reads every field when the System and its owner set them', () => {
    const fields = readIncidentFields(
      system({
        'mozilla.org/escalation-slack-channel-id': 'C0123456789',
        'pagerduty.com/service-id': 'PABC123',
      }),
      group({
        'mozilla.org/sponsor': 'sponsor@mozilla.com',
        'mozilla.org/managers': 'a@mozilla.com, b@mozilla.com',
      }),
    );
    expect(fields).toEqual({
      sponsor: 'sponsor@mozilla.com',
      managers: ['a@mozilla.com', 'b@mozilla.com'],
      slackUrl: 'https://mozilla.slack.com/archives/C0123456789',
      pagerDutyUrl: 'https://mozilla.pagerduty.com/service-directory/PABC123',
    });
  });

  it('leaves every field unset when nothing is annotated', () => {
    expect(readIncidentFields(system(), group())).toEqual({
      sponsor: undefined,
      managers: [],
      slackUrl: undefined,
      pagerDutyUrl: undefined,
    });
  });

  it('still reads the System fields when the owner Group is missing', () => {
    const fields = readIncidentFields(
      system({ 'pagerduty.com/service-id': 'PABC123' }),
    );
    expect(fields.sponsor).toBeUndefined();
    expect(fields.managers).toEqual([]);
    expect(fields.slackUrl).toBeUndefined();
    expect(fields.pagerDutyUrl).toBe(
      'https://mozilla.pagerduty.com/service-directory/PABC123',
    );
  });

  it('treats an empty annotation value as unset', () => {
    const fields = readIncidentFields(
      system({
        'mozilla.org/escalation-slack-channel-id': '',
        'pagerduty.com/service-id': '',
      }),
      group({ 'mozilla.org/sponsor': '', 'mozilla.org/managers': '' }),
    );
    expect(fields).toEqual({
      sponsor: undefined,
      managers: [],
      slackUrl: undefined,
      pagerDutyUrl: undefined,
    });
  });
});
