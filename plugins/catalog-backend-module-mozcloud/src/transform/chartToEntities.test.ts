import { ChartDeploymentsRow } from './schema';
import { chartToEntities } from './chartToEntities';

const LOCATION = 'mozcloud:fake';

const baseRow = (
  overrides: Partial<ChartDeploymentsRow> = {},
): ChartDeploymentsRow => ({
  tenant: 'backstage',
  chart_name: 'backstage',
  chart_count: 1,
  function: 'webservices',
  workgroups: ['backstage'],
  deployment_type: 'argocd',
  application_repository: 'mozilla-services/moz-backstage-app',
  release_name: undefined,
  images: [{ name: 'moz-backstage-app', auto_update: true }],
  deployments: [
    { realm: 'prod', environment: 'prod', region: 'us-west1' },
    { realm: 'nonprod', environment: 'stage', region: 'us-west1' },
  ],
  ...overrides,
});

describe('chartToEntities', () => {
  describe('single-chart tenant', () => {
    const entities = chartToEntities(baseRow(), LOCATION);
    const byKind = (kind: string) => entities.filter(e => e.kind === kind);
    const services = byKind('Component').filter(
      c => (c.spec as { type?: string }).type === 'service',
    );
    const deployments = byKind('Component').filter(
      c => (c.spec as { type?: string }).type === 'helm-deployment',
    );

    it('names the chart Component after the tenant when chart_count === 1', () => {
      expect(services).toHaveLength(1);
      expect(services[0].metadata.name).toBe('backstage');
    });

    it('attaches the chart Component to the tenant System with workgroup owner', () => {
      expect(services[0].spec).toMatchObject({
        type: 'service',
        lifecycle: 'production',
        system: 'backstage',
        owner: 'group:workgroups/backstage',
      });
    });

    it('annotates the chart Component with chart metadata', () => {
      const ann = services[0].metadata.annotations ?? {};
      expect(ann['mozilla.org/chart-name']).toBe('backstage');
      expect(ann['mozilla.org/deployment-type']).toBe('argocd');
      expect(ann['mozilla.org/auto-update']).toBe('true');
      expect(ann['mozilla.org/image-aliases']).toBe('moz-backstage-app');
      expect(ann['github.com/project-slug']).toBe(
        'mozilla-services/moz-backstage-app',
      );
      expect(ann['backstage.io/source-location']).toBe(
        'url:https://github.com/mozilla-services/moz-backstage-app/',
      );
    });

    it('sets the Grafana selectors from the app_code and component_code tags', () => {
      const ann = services[0].metadata.annotations ?? {};
      expect(ann['grafana/dashboard-selector']).toBe(
        "tags @> 'app_code=backstage' && tags @> 'component_code=backstage'",
      );
      expect(ann['grafana/alert-label-selector']).toBe(
        'app_code=backstage, component_code=backstage',
      );
    });

    it('emits one helm-deployment Component per (realm, environment)', () => {
      expect(deployments.map(d => d.metadata.name).sort()).toEqual([
        'backstage-prod',
        'backstage-stage',
      ]);
    });

    it('names sub-Components <component>-<environment>, subcomponentOf the chart', () => {
      const stage = deployments.find(
        d => d.metadata.name === 'backstage-stage',
      )!;
      expect(stage.spec).toMatchObject({
        type: 'helm-deployment',
        lifecycle: 'production',
        subcomponentOf: 'backstage',
        owner: 'group:workgroups/backstage',
      });
    });

    it('carries realm/environment/regions on sub-Component annotations', () => {
      const stage = deployments.find(
        d => d.metadata.name === 'backstage-stage',
      )!;
      const ann = stage.metadata.annotations ?? {};
      expect(ann['mozilla.org/realm']).toBe('nonprod');
      expect(ann['mozilla.org/environment']).toBe('stage');
      expect(ann['mozilla.org/regions']).toBe('us-west1');
      expect(ann['mozilla.org/chart-name']).toBe('backstage');
    });

    it('builds an argocd-urls annotation following the Mozilla URL convention', () => {
      const stage = deployments.find(
        d => d.metadata.name === 'backstage-stage',
      )!;
      expect(stage.metadata.annotations?.['mozilla.org/argocd-urls']).toBe(
        'us-west1=https://webservices.argocd.global.mozgcp.net/applications/argocd-webservices/backstage-stage-us-west1-backstage?view=tree&resource=',
      );
    });
  });

  describe('multi-chart tenant naming', () => {
    it('uses chart_name directly even when the tenant has multiple charts', () => {
      const entities = chartToEntities(
        baseRow({
          tenant: 'socorro',
          chart_name: 'antenna',
          chart_count: 2,
          workgroups: ['crash-ingestion'],
          application_repository: 'mozilla-services/antenna',
          release_name: 'antenna',
          images: [{ name: 'antenna', auto_update: true }],
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
          ],
        }),
        LOCATION,
      );
      const service = entities.find(
        e =>
          e.kind === 'Component' &&
          (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.metadata.name).toBe('antenna');

      const deployment = entities.find(
        e =>
          e.kind === 'Component' &&
          (e.spec as { type?: string }).type === 'helm-deployment',
      )!;
      expect(deployment.metadata.name).toBe('antenna-prod');
      expect(deployment.spec).toMatchObject({ subcomponentOf: 'antenna' });
    });
  });

  describe('region aggregation', () => {
    it('joins multiple regions for the same (realm, environment) into one Component', () => {
      const entities = chartToEntities(
        baseRow({
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
            { realm: 'prod', environment: 'prod', region: 'us-east1' },
            { realm: 'prod', environment: 'prod', region: 'europe-west1' },
          ],
        }),
        LOCATION,
      );
      const deployments = entities.filter(
        e =>
          e.kind === 'Component' &&
          (e.spec as { type?: string }).type === 'helm-deployment',
      );
      expect(deployments).toHaveLength(1);
      const ann = deployments[0].metadata.annotations ?? {};
      expect(ann['mozilla.org/regions']).toBe('us-west1,us-east1,europe-west1');
      expect(ann['mozilla.org/argocd-urls']).toMatch(
        /us-west1=.*\|us-east1=.*\|europe-west1=.*/,
      );
    });

    it('deduplicates repeated region rows for the same (realm, environment)', () => {
      const entities = chartToEntities(
        baseRow({
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
          ],
        }),
        LOCATION,
      );
      const deployments = entities.filter(
        e => (e.spec as { type?: string }).type === 'helm-deployment',
      );
      expect(deployments).toHaveLength(1);
      expect(deployments[0].metadata.annotations?.['mozilla.org/regions']).toBe(
        'us-west1',
      );
    });

    it('drops deployment rows missing realm/environment/region', () => {
      const entities = chartToEntities(
        baseRow({
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
            { realm: undefined, environment: 'prod', region: 'us-west1' },
            { realm: 'prod', environment: undefined, region: 'us-west1' },
            { realm: 'prod', environment: 'prod', region: undefined },
          ],
        }),
        LOCATION,
      );
      const deployments = entities.filter(
        e => (e.spec as { type?: string }).type === 'helm-deployment',
      );
      expect(deployments).toHaveLength(1);
    });
  });

  describe('non-argocd deployments', () => {
    it('skips helm-deployment Components when deployment_type is gha', () => {
      const entities = chartToEntities(
        baseRow({
          deployment_type: 'gha',
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
          ],
        }),
        LOCATION,
      );
      expect(
        entities.filter(
          e => (e.spec as { type?: string }).type === 'helm-deployment',
        ),
      ).toHaveLength(0);
      // The chart Component is still emitted
      expect(
        entities.filter(e => (e.spec as { type?: string }).type === 'service'),
      ).toHaveLength(1);
    });

    it('skips helm-deployment Components when deployment_type is unset', () => {
      const entities = chartToEntities(
        baseRow({
          deployment_type: undefined,
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
          ],
        }),
        LOCATION,
      );
      expect(
        entities.filter(
          e => (e.spec as { type?: string }).type === 'helm-deployment',
        ),
      ).toHaveLength(0);
    });
  });

  describe('images annotations', () => {
    it('reports auto-update=false when no image carries auto_update', () => {
      const entities = chartToEntities(
        baseRow({
          images: [{ name: 'a' }, { name: 'b' }],
        }),
        LOCATION,
      );
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.metadata.annotations?.['mozilla.org/auto-update']).toBe(
        'false',
      );
    });

    it('omits the auto-update annotation when the chart declares no images', () => {
      const entities = chartToEntities(baseRow({ images: [] }), LOCATION);
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.metadata.annotations).not.toHaveProperty(
        'mozilla.org/auto-update',
      );
      expect(service.metadata.annotations).not.toHaveProperty(
        'mozilla.org/image-aliases',
      );
    });

    it('joins image aliases (names) with commas', () => {
      const entities = chartToEntities(
        baseRow({
          images: [{ name: 'api' }, { name: 'worker' }],
        }),
        LOCATION,
      );
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.metadata.annotations?.['mozilla.org/image-aliases']).toBe(
        'api,worker',
      );
    });
  });

  describe('optional fields', () => {
    it('omits github/source-location annotations when application_repository is missing', () => {
      const entities = chartToEntities(
        baseRow({ application_repository: undefined }),
        LOCATION,
      );
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      const ann = service.metadata.annotations ?? {};
      expect(ann).not.toHaveProperty('github.com/project-slug');
      expect(ann).not.toHaveProperty('backstage.io/source-location');
    });

    it('emits release-name annotation when present', () => {
      const entities = chartToEntities(
        baseRow({ release_name: 'antenna' }),
        LOCATION,
      );
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.metadata.annotations?.['mozilla.org/release-name']).toBe(
        'antenna',
      );
    });

    it('falls back to the default workgroup ref when workgroups is empty', () => {
      const entities = chartToEntities(baseRow({ workgroups: [] }), LOCATION);
      const service = entities.find(
        e => (e.spec as { type?: string }).type === 'service',
      )!;
      expect(service.spec).toMatchObject({ owner: 'group:default/unowned' });
    });
  });

  describe('empty deployments', () => {
    it('emits only the chart Component for argocd charts with no deployments', () => {
      const entities = chartToEntities(baseRow({ deployments: [] }), LOCATION);
      expect(entities).toHaveLength(1);
      expect((entities[0].spec as { type?: string }).type).toBe('service');
    });
  });

  describe('annotations', () => {
    it('always tags every entity with managed-by-location', () => {
      const entities = chartToEntities(baseRow(), LOCATION);
      for (const e of entities) {
        expect(
          e.metadata.annotations?.['backstage.io/managed-by-location'],
        ).toBe(LOCATION);
        expect(
          e.metadata.annotations?.['backstage.io/managed-by-origin-location'],
        ).toBe(LOCATION);
      }
    });
  });

  describe('entity links', () => {
    const entities = chartToEntities(baseRow(), LOCATION);
    const service = entities.find(
      e => (e.spec as { type?: string }).type === 'service',
    )!;
    const deployments = entities.filter(
      e => (e.spec as { type?: string }).type === 'helm-deployment',
    );
    const linkUrl = (e: (typeof entities)[number], title: string) =>
      (e.metadata.links ?? []).find(l => l.title === title)?.url;
    const argoLinks = (e: (typeof entities)[number]) =>
      (e.metadata.links ?? []).filter(l =>
        (l.title ?? '').startsWith('ArgoCD:'),
      );

    it('links the service to its Helm chart directory in <function>-infra', () => {
      expect(linkUrl(service, 'Helm chart')).toBe(
        'https://github.com/mozilla/webservices-infra/tree/main/backstage/k8s/backstage',
      );
    });

    it('adds an ArgoCD link per (environment, region) at the service level', () => {
      expect(
        argoLinks(service)
          .map(l => l.title)
          .sort(),
      ).toEqual(['ArgoCD: prod (us-west1)', 'ArgoCD: stage (us-west1)']);
      expect(linkUrl(service, 'ArgoCD: stage (us-west1)')).toBe(
        'https://webservices.argocd.global.mozgcp.net/applications/argocd-webservices/backstage-stage-us-west1-backstage?view=tree&resource=',
      );
    });

    it('links each helm-deployment to the chart dir and its env values file', () => {
      const stage = deployments.find(
        d => d.metadata.name === 'backstage-stage',
      )!;
      expect(linkUrl(stage, 'Helm chart')).toBe(
        'https://github.com/mozilla/webservices-infra/tree/main/backstage/k8s/backstage',
      );
      expect(linkUrl(stage, 'Values (stage)')).toBe(
        'https://github.com/mozilla/webservices-infra/blob/main/backstage/k8s/backstage/values-stage.yaml',
      );
    });

    it('emits one ArgoCD service link per region when multi-region', () => {
      const multi = chartToEntities(
        baseRow({
          deployments: [
            { realm: 'prod', environment: 'prod', region: 'us-west1' },
            { realm: 'prod', environment: 'prod', region: 'europe-west1' },
          ],
        }),
        LOCATION,
      ).find(e => (e.spec as { type?: string }).type === 'service')!;
      expect(argoLinks(multi).map(l => l.title)).toEqual([
        'ArgoCD: prod (us-west1)',
        'ArgoCD: prod (europe-west1)',
      ]);
    });

    it('gives non-argocd services only the Helm chart link (no ArgoCD links)', () => {
      const gha = chartToEntities(
        baseRow({ deployment_type: 'gha' }),
        LOCATION,
      ).find(e => (e.spec as { type?: string }).type === 'service')!;
      expect((gha.metadata.links ?? []).map(l => l.title)).toEqual([
        'Helm chart',
      ]);
    });
  });
});
