import { mockServices } from '@backstage/backend-test-utils';
import {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
  UrlReaderService,
} from '@backstage/backend-plugin-api';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { Source } from './sources/Source';
import { ChartDeploymentsRow, TenantRow } from './transform/schema';
import { OverlayConfig } from './overlay/fetchTenantOverlay';

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

const TENANT_OPS: TenantRow = {
  globals: {
    app_code: 'service-ops',
    function: 'webservices',
    risk_level: 'low',
    workgroups: ['team-x'],
    ops: {
      runbooks_url: 'https://tenant.example.com/runbooks',
      escalation: { pagerduty_service_id: 'PTENANT1' },
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

  it('merges a tenant overlay: enriches the System and adds a new entity', async () => {
    const overlayYaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: service-a
  description: Service A overlay description
  tags:
    - extra-tag
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: service-a-public
spec:
  type: openapi
  lifecycle: production
`;
    const reader = {
      readUrl: async () => ({ buffer: async () => Buffer.from(overlayYaml) }),
    } as unknown as UrlReaderService;

    const overlay: OverlayConfig = {
      enabled: true,
      repoUrlTemplate: 'https://github.com/mozilla/{function}-infra',
      pathTemplate: '{app_code}/catalog-info.yaml',
      branch: 'main',
    };

    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudTenantEntityProvider(
      new FakeSource<TenantRow>('fake-tenants:in-memory', [TENANT_A]),
      new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
      reader,
      overlay,
    );

    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const entities = captured[0].entities.map(e => e.entity);

    const systemA = entities.find(
      e => e.kind === 'System' && e.metadata.name === 'service-a',
    )!;
    expect(systemA.metadata.description).toBe('Service A overlay description');
    expect(systemA.metadata.tags).toEqual(
      expect.arrayContaining(['webservices', 'risk-high', 'extra-tag']),
    );

    const newApi = entities.find(
      e => e.kind === 'API' && e.metadata.name === 'service-a-public',
    )!;
    expect(newApi).toBeDefined();
    expect((newApi.spec as any).system).toBe('service-a');
    expect((newApi.spec as any).owner).toBe('group:workgroups/team-x');
  });

  it('puts tenant ops values on the System when overlays are off', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudTenantEntityProvider(
      new FakeSource<TenantRow>('fake-tenants:in-memory', [TENANT_OPS]),
      new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );

    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const system = captured[0].entities
      .map(e => e.entity)
      .find(e => e.kind === 'System' && e.metadata.name === 'service-ops')!;
    expect(system.metadata.annotations).toMatchObject({
      'mozilla.org/runbook': 'https://tenant.example.com/runbooks',
      'pagerduty.com/service-id': 'PTENANT1',
    });
    expect(system.metadata.links).toEqual([
      {
        url: 'https://tenant.example.com/runbooks',
        title: 'Runbooks',
        icon: 'docs',
      },
    ]);
  });

  it('lets tenant ops values win over an overlay and drops invalid overlay values', async () => {
    const overlayYaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: service-ops
  annotations:
    mozilla.org/runbook: https://overlay.example.com/runbooks
    mozilla.org/confluence-url: https://overlay.example.com/wiki
    mozilla.org/escalation-slack-channel-id: '#general'
  links:
    - url: https://overlay.example.com/runbooks
      title: Old runbook
    - url: https://other.example.com
      title: Other
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: service-ops-web
  annotations:
    mozilla.org/runbook: https://overlay.example.com/web-runbook
    mozilla.org/issue-tracker-url: http://insecure.example.com/issues
    pagerduty.com/service-id: not a service id
  links:
    - url: http://insecure.example.com/issues
      title: Issues
    - url: https://other.example.com/web
      title: Web
spec:
  type: service
  lifecycle: production
`;
    const reader = {
      readUrl: async () => ({ buffer: async () => Buffer.from(overlayYaml) }),
    } as unknown as UrlReaderService;
    const overlay: OverlayConfig = {
      enabled: true,
      repoUrlTemplate: 'https://github.com/mozilla/{function}-infra',
      pathTemplate: '{app_code}/catalog-info.yaml',
      branch: 'main',
    };
    const logger = mockServices.logger.mock();

    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudTenantEntityProvider(
      new FakeSource<TenantRow>('fake-tenants:in-memory', [TENANT_OPS]),
      new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
      logger,
      new ImmediateTaskRunner(),
      reader,
      overlay,
    );

    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const entities = captured[0].entities.map(e => e.entity);
    const system = entities.find(
      e => e.kind === 'System' && e.metadata.name === 'service-ops',
    )!;
    const component = entities.find(
      e => e.kind === 'Component' && e.metadata.name === 'service-ops-web',
    )!;

    // The tenant wins over the conflicting overlay runbook, an overlay value
    // for a key the tenant leaves unset is kept, and an invalid one is dropped.
    expect(system.metadata.annotations).toMatchObject({
      'mozilla.org/runbook': 'https://tenant.example.com/runbooks',
      'pagerduty.com/service-id': 'PTENANT1',
      'mozilla.org/confluence-url': 'https://overlay.example.com/wiki',
    });
    expect(system.metadata.annotations).not.toHaveProperty(
      'mozilla.org/escalation-slack-channel-id',
    );
    expect(system.metadata.links?.map(l => l.title)).toEqual([
      'Runbooks',
      'Other',
    ]);

    // A Component's own overlay runbook is untouched; its invalid value is not.
    expect(component.metadata.annotations).toMatchObject({
      'mozilla.org/runbook': 'https://overlay.example.com/web-runbook',
    });
    expect(component.metadata.annotations).not.toHaveProperty(
      'pagerduty.com/service-id',
    );
    // An invalid URL loses its annotation and its link, so it can't be clicked.
    expect(component.metadata.annotations).not.toHaveProperty(
      'mozilla.org/issue-tracker-url',
    );
    expect(component.metadata.links?.map(l => l.title)).toEqual(['Web']);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'mozilla.org/runbook on system:default/service-ops',
      ),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'pagerduty.com/service-id on component:default/service-ops-web',
      ),
    );
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
