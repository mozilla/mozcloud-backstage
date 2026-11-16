import {
  INCIDENT_ANNOTATIONS,
  INCIDENT_ANNOTATION_KEYS,
  isValidIncidentValue,
  readIncident,
} from './incident';

const FULL_OPS = {
  issue_tracker_url: 'https://example.com/issues/new',
  runbooks_url: 'https://example.com/runbooks',
  confluence_url: 'https://example.com/wiki',
  escalation: {
    slack_channel_id: 'C0123456789',
    pagerduty_service_id: 'PABC123',
  },
};

describe('INCIDENT_ANNOTATIONS', () => {
  it('uses the agreed annotation keys', () => {
    expect(INCIDENT_ANNOTATIONS).toEqual({
      pagerdutyServiceId: 'pagerduty.com/service-id',
      escalationSlackChannelId: 'mozilla.org/escalation-slack-channel-id',
      runbook: 'mozilla.org/runbook',
      confluenceUrl: 'mozilla.org/confluence-url',
      issueTrackerUrl: 'mozilla.org/issue-tracker-url',
    });
  });

  it('lists every key once in INCIDENT_ANNOTATION_KEYS', () => {
    expect([...INCIDENT_ANNOTATION_KEYS].sort()).toEqual(
      Object.values(INCIDENT_ANNOTATIONS).sort(),
    );
  });
});

describe('isValidIncidentValue', () => {
  describe.each([
    ['runbook', INCIDENT_ANNOTATIONS.runbook],
    ['confluenceUrl', INCIDENT_ANNOTATIONS.confluenceUrl],
    ['issueTrackerUrl', INCIDENT_ANNOTATIONS.issueTrackerUrl],
  ])('%s (https URL)', (_name, key) => {
    // Mirrors `^https://` in tenants/schema.json, so a value that passes the
    // tenant CI is never dropped here. A bare `https://` passes there too.
    it.each(['https://example.com/a?b=c', 'https://example.com', 'https://'])(
      'accepts %j',
      value => {
        expect(isValidIncidentValue(key, value)).toBe(true);
      },
    );

    it.each([
      'http://example.com',
      'example.com',
      '',
      ' https://example.com',
      'HTTPS://example.com',
      'ftp://example.com',
      42,
      null,
      undefined,
      {},
      ['https://example.com'],
    ])('rejects %j', value => {
      expect(isValidIncidentValue(key, value)).toBe(false);
    });
  });

  describe('escalationSlackChannelId', () => {
    const key = INCIDENT_ANNOTATIONS.escalationSlackChannelId;

    it.each(['C0123456789', 'G0123ABCD'])('accepts %j', value => {
      expect(isValidIncidentValue(key, value)).toBe(true);
    });

    it.each([
      'c0123456789',
      'D0123456789',
      'C',
      '#general',
      'general',
      '',
      'C0123456789 ',
      'C0123456789\n',
      42,
      null,
    ])('rejects %j', value => {
      expect(isValidIncidentValue(key, value)).toBe(false);
    });
  });

  describe('pagerdutyServiceId', () => {
    const key = INCIDENT_ANNOTATIONS.pagerdutyServiceId;

    it.each(['PABC123', '0ABC'])('accepts %j', value => {
      expect(isValidIncidentValue(key, value)).toBe(true);
    });

    it.each(['pabc123', '', 'P ABC', 'PABC\n', 42, null])(
      'rejects %j',
      value => {
        expect(isValidIncidentValue(key, value)).toBe(false);
      },
    );
  });
});

describe('readIncident', () => {
  it('maps every field to its annotation and emits links in a fixed order', () => {
    const onProblem = jest.fn();

    expect(readIncident(FULL_OPS, onProblem)).toEqual({
      annotations: {
        'pagerduty.com/service-id': 'PABC123',
        'mozilla.org/escalation-slack-channel-id': 'C0123456789',
        'mozilla.org/runbook': 'https://example.com/runbooks',
        'mozilla.org/confluence-url': 'https://example.com/wiki',
        'mozilla.org/issue-tracker-url': 'https://example.com/issues/new',
      },
      links: [
        {
          url: 'https://example.com/runbooks',
          title: 'Runbooks',
          icon: 'docs',
        },
        { url: 'https://example.com/wiki', title: 'Confluence', icon: 'docs' },
        {
          url: 'https://example.com/issues/new',
          title: 'Report an issue',
          icon: 'help',
        },
      ],
    });
    expect(onProblem).not.toHaveBeenCalled();
  });

  it('reads a partial block and emits links only for URL fields', () => {
    const onProblem = jest.fn();

    expect(
      readIncident(
        { escalation: { pagerduty_service_id: 'PABC123' } },
        onProblem,
      ),
    ).toEqual({
      annotations: { 'pagerduty.com/service-id': 'PABC123' },
      links: [],
    });
    expect(onProblem).not.toHaveBeenCalled();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty object', {}],
    ['a null escalation', { escalation: null }],
  ])('treats %s as unset without a problem', (_label, ops) => {
    const onProblem = jest.fn();

    expect(readIncident(ops, onProblem)).toEqual({
      annotations: {},
      links: [],
    });
    expect(onProblem).not.toHaveBeenCalled();
  });

  it.each([
    ['a string', 'not-an-object'],
    ['an array', ['https://example.com']],
    ['a number', 5],
  ])('reports ops as %s and ignores it', (_label, ops) => {
    const onProblem = jest.fn();

    expect(readIncident(ops, onProblem)).toEqual({
      annotations: {},
      links: [],
    });
    expect(onProblem).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith('ops', expect.any(String));
  });

  it.each([
    ['a string', 'C0123456789'],
    ['an array', ['C0123456789']],
    ['a number', 5],
  ])('reports escalation as %s and keeps the other fields', (_label, esc) => {
    const onProblem = jest.fn();

    const result = readIncident(
      { runbooks_url: 'https://example.com/runbooks', escalation: esc },
      onProblem,
    );

    expect(result.annotations).toEqual({
      'mozilla.org/runbook': 'https://example.com/runbooks',
    });
    expect(onProblem).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith(
      'ops.escalation',
      expect.any(String),
    );
  });

  it('drops only an invalid leaf and names its path', () => {
    const onProblem = jest.fn();

    const result = readIncident(
      {
        ...FULL_OPS,
        runbooks_url: 'http://insecure.example.com',
        escalation: {
          slack_channel_id: '#general',
          pagerduty_service_id: 'PABC123',
        },
      },
      onProblem,
    );

    expect(result.annotations).toEqual({
      'pagerduty.com/service-id': 'PABC123',
      'mozilla.org/confluence-url': 'https://example.com/wiki',
      'mozilla.org/issue-tracker-url': 'https://example.com/issues/new',
    });
    expect(result.links.map(l => l.title)).toEqual([
      'Confluence',
      'Report an issue',
    ]);
    expect(onProblem).toHaveBeenCalledTimes(2);
    expect(onProblem).toHaveBeenCalledWith(
      'ops.runbooks_url',
      expect.any(String),
    );
    expect(onProblem).toHaveBeenCalledWith(
      'ops.escalation.slack_channel_id',
      expect.any(String),
    );
  });

  it('reports a non-string leaf', () => {
    const onProblem = jest.fn();

    const result = readIncident({ runbooks_url: 42 }, onProblem);

    expect(result.annotations).toEqual({});
    expect(onProblem).toHaveBeenCalledWith(
      'ops.runbooks_url',
      expect.any(String),
    );
  });

  it('treats an empty-string leaf as invalid, not unset', () => {
    const onProblem = jest.fn();

    const result = readIncident({ confluence_url: '' }, onProblem);

    expect(result.annotations).toEqual({});
    expect(onProblem).toHaveBeenCalledWith(
      'ops.confluence_url',
      expect.any(String),
    );
  });

  it('ignores unknown keys without a problem', () => {
    const onProblem = jest.fn();

    expect(
      readIncident({ future_field: 'x', escalation: { future: 1 } }, onProblem),
    ).toEqual({ annotations: {}, links: [] });
    expect(onProblem).not.toHaveBeenCalled();
  });

  it('does not require a problem callback', () => {
    expect(() => readIncident('not-an-object')).not.toThrow();
    expect(() => readIncident({ runbooks_url: 'nope' })).not.toThrow();
  });
});
