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
import { TenantRow } from './transform/schema';

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

class FakeSource implements Source {
  description = 'fake:in-memory';
  constructor(private readonly rows: TenantRow[]) {}
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
      new FakeSource([TENANT_A, TENANT_B]),
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

    // 2 systems + 2 components + 1 resource (TENANT_A only has prod) + 1 dedup'd group
    expect(refs).toEqual(
      expect.arrayContaining([
        'system:default/service-a',
        'system:default/service-b',
        'component:default/service-a',
        'component:default/service-b',
        'resource:default/moz-fx-a-prod',
        'group:workgroups/team-x',
      ]),
    );

    // The team-x Group must appear exactly once despite two tenants emitting it.
    const groupCount = refs.filter(r => r === 'group:workgroups/team-x').length;
    expect(groupCount).toBe(1);

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
      new FakeSource([]),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );

    await provider.connect(connection);

    expect(captured).toHaveLength(1);
    if (captured[0].type !== 'full') throw new Error('unreachable');
    expect(captured[0].entities).toHaveLength(0);
  });
});
