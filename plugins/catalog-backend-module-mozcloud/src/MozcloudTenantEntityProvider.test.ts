import { mockServices } from '@backstage/backend-test-utils';
import {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { Source } from './sources/Source';
import { ChartDeploymentsRow, TenantRow } from './transform/schema';

const TENANT_A: TenantRow = {
  globals: {
    app_code: 'service-a',
    function: 'webservices',
    risk_level: 'high',
    workgroups: ['team-x'],
    deployment: {
      type: 'argocd',
      charts: { main: { application_repository: 'mozilla/a' } },
    },
  },
  realms: {
    prod: { project_id: 'moz-fx-a-prod', environments: [{ name: 'prod' }] },
  },
};

const TENANT_B: TenantRow = {
  globals: {
    app_code: 'service-b',
    function: 'webservices',
    risk_level: 'low',
    workgroups: ['team-x'], // shares team-x with TENANT_A — Group should dedupe
    deployment: {
      type: 'argocd',
      charts: { main: { application_repository: 'mozilla/b' } },
    },
  },
  realms: {},
};

class FakeSource<T> implements Source<T> {
  constructor(
    public readonly description: string,
    private readonly rows: T[],
  ) {}
  async fetchAll() {
    return this.rows;
  }
}

class ImmediateTaskRunner implements SchedulerServiceTaskRunner {
  async run(task: SchedulerServiceTaskInvocationDefinition) {
    await task.fn(new AbortController().signal);
  }
}

describe('MozcloudTenantEntityProvider', () => {
  it('applies a single full mutation containing all transformed entities', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudTenantEntityProvider(
      new FakeSource<TenantRow>('fake-tenants:in-memory', [TENANT_A, TENANT_B]),
      new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );

    await provider.connect(connection);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('full');
    if (captured[0].type !== 'full') throw new Error('unreachable');

    const entities = captured[0].entities.map(e => e.entity);
    const refs = entities.map(
      e =>
        `${e.kind.toLowerCase()}:${e.metadata.namespace ?? 'default'}/${
          e.metadata.name
        }`,
    );

    // With an empty charts source, only tenant-level entities are emitted:
    // 1 dedup'd Domain + 2 Systems + 1 Resource (TENANT_A's prod realm).
    // Chart Components are emitted by chartToEntities, exercised separately.
    expect(refs).toEqual(
      expect.arrayContaining([
        'domain:default/webservices',
        'system:default/service-a',
        'system:default/service-b',
        'resource:default/moz-fx-a-prod',
      ]),
    );
    expect(refs.filter(r => r.startsWith('component:'))).toHaveLength(0);

    // The webservices Domain must appear exactly once despite two tenants
    // emitting it (the workgroup `team-x` is no longer emitted by this
    // provider — the workgroup provider owns that).
    const domainCount = refs.filter(
      r => r === 'domain:default/webservices',
    ).length;
    expect(domainCount).toBe(1);
    expect(refs).not.toContain('group:workgroups/team-x');

    // Every emitted entity should carry the provider name as its locationKey.
    for (const e of captured[0].entities) {
      expect(e.locationKey).toBe('MozcloudTenantEntityProvider');
    }
  });

  it('handles an empty source gracefully', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudTenantEntityProvider(
      new FakeSource<TenantRow>('fake-tenants:in-memory', []),
      new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );

    await provider.connect(connection);

    expect(captured).toHaveLength(1);
    if (captured[0].type !== 'full') throw new Error('unreachable');
    expect(captured[0].entities).toHaveLength(0);
  });
});
