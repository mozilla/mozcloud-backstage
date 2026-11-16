import { mockServices } from '@backstage/backend-test-utils';
import { BigQuery } from '@google-cloud/bigquery';
import { defineBigQuerySource, normalizeTenantRow } from './BigQuerySource';
import { TenantRow, TenantRowSchema } from '../transform/schema';

/** A BigQuery client whose query always resolves to the given rows. */
const fakeBq = (rows: Record<string, unknown>[]) =>
  ({ query: async () => [rows] } as unknown as BigQuery);

const tenantsSource = (
  rows: Record<string, unknown>[],
  logger = mockServices.logger.mock(),
) =>
  defineBigQuerySource<TenantRow>({
    query: 'SELECT * FROM tenants',
    schema: TenantRowSchema,
    description: 'fake-bq:tenants',
    normalize: normalizeTenantRow,
    logger,
    bq: fakeBq(rows),
  });

const globals = (extra: Record<string, unknown> = {}) => ({
  app_code: 'opsapp',
  function: 'webservices',
  risk_level: 'low',
  workgroups: ['opsapp'],
  ...extra,
});

describe('tenants source: globals.ops through ingestion', () => {
  it('strips BigQuery nulls from a nested ops struct', async () => {
    const [row] = await tenantsSource([
      {
        tenant: 'opsapp',
        realms: [],
        globals: globals({
          ops: {
            issue_tracker_url: null,
            runbooks_url: 'https://example.com/runbooks',
            confluence_url: null,
            escalation: {
              slack_channel_id: 'C0123456789',
              pagerduty_service_id: null,
            },
          },
        }),
      },
    ]).fetchAll();

    expect(row.globals.ops).toStrictEqual({
      runbooks_url: 'https://example.com/runbooks',
      escalation: { slack_channel_id: 'C0123456789' },
    });
  });

  it('treats a null ops column as unset', async () => {
    const [row] = await tenantsSource([
      { tenant: 'opsapp', realms: [], globals: globals({ ops: null }) },
    ]).fetchAll();

    expect(row.globals).not.toHaveProperty('ops');
  });

  it('reads ops when the pipeline writes globals as a JSON string', async () => {
    const [row] = await tenantsSource([
      {
        tenant: 'opsapp',
        realms: [],
        globals: JSON.stringify(
          globals({ ops: { escalation: { pagerduty_service_id: 'PABC123' } } }),
        ),
      },
    ]).fetchAll();

    expect(row.globals.ops).toStrictEqual({
      escalation: { pagerduty_service_id: 'PABC123' },
    });
  });

  it.each([
    ['a string', 'not-an-object'],
    ['an escalation that is a number', { escalation: 5 }],
    ['a runbooks_url that is a number', { runbooks_url: 42 }],
  ])('keeps the tenant when ops has %s', async (_label, ops) => {
    const rows = await tenantsSource([
      { tenant: 'opsapp', realms: [], globals: globals({ ops }) },
    ]).fetchAll();

    expect(rows).toHaveLength(1);
    expect(rows[0].globals.app_code).toBe('opsapp');
    expect(rows[0].globals.ops).toStrictEqual(ops);
  });

  it('still skips a row that fails the schema, and warns', async () => {
    const logger = mockServices.logger.mock();

    const rows = await tenantsSource(
      [
        { tenant: 'good', realms: [], globals: globals() },
        { tenant: 'bad', realms: [], globals: { function: 'webservices' } },
      ],
      logger,
    ).fetchAll();

    expect(rows.map(r => r.globals.app_code)).toEqual(['opsapp']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping invalid row'),
    );
  });
});
