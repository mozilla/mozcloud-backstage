import { mockServices } from '@backstage/backend-test-utils';
import { Entity } from '@backstage/catalog-model';
import {
  entityRef,
  belongsToTenant,
  mergeOverlayEntities,
  TenantScope,
} from './mergeOverlay';

const scope: TenantScope = { appCode: 'merino', owner: 'group:workgroups/merino' };
const logger = () => mockServices.logger.mock();

const generated = (): Entity[] => [
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: 'merino',
      tags: ['webservices', 'risk-high'],
      annotations: { 'mozilla.org/function': 'webservices' },
      links: [{ url: 'https://a', title: 'A' }],
    },
    spec: { owner: 'group:workgroups/merino', domain: 'webservices' },
  },
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: { name: 'other-tenant' },
    spec: { owner: 'group:workgroups/other' },
  },
];

describe('entityRef', () => {
  it('builds a lowercased kind:namespace/name ref with default namespace', () => {
    expect(entityRef({ kind: 'System', metadata: { name: 'Merino' } } as Entity)).toBe(
      'system:default/merino',
    );
    expect(
      entityRef({ kind: 'API', metadata: { name: 'x', namespace: 'NS' } } as Entity),
    ).toBe('api:ns/x');
  });
});

describe('belongsToTenant', () => {
  it('matches the tenant System by name', () => {
    expect(belongsToTenant(generated()[0], 'merino')).toBe(true);
  });
  it('matches an entity via spec.system', () => {
    const c = { kind: 'Component', metadata: { name: 'svc' }, spec: { system: 'merino' } } as unknown as Entity;
    expect(belongsToTenant(c, 'merino')).toBe(true);
  });
  it('rejects another tenant', () => {
    expect(belongsToTenant(generated()[1], 'merino')).toBe(false);
  });
});

describe('mergeOverlayEntities', () => {
  it('overrides scalar and deep-merges annotations on a matching tenant entity', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
          name: 'merino',
          description: 'The Merino suggestion service',
          annotations: { 'mozilla.org/slack-channel': '#merino' },
        },
        spec: { lifecycle: 'production' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const sys = out.find(e => e.metadata.name === 'merino')!;
    expect(sys.metadata.description).toBe('The Merino suggestion service');
    expect(sys.metadata.annotations).toEqual({
      'mozilla.org/function': 'webservices',
      'mozilla.org/slack-channel': '#merino',
    });
    expect((sys.spec as any).lifecycle).toBe('production');
    expect((sys.spec as any).domain).toBe('webservices'); // untouched base field kept
  });

  it('appends and dedupes tags and links rather than replacing', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
          name: 'merino',
          tags: ['risk-high', 'public-api'],
          links: [{ url: 'https://a', title: 'A dup' }, { url: 'https://b', title: 'B' }],
        },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const sys = out.find(e => e.metadata.name === 'merino')!;
    expect(sys.metadata.tags).toEqual(['webservices', 'risk-high', 'public-api']);
    expect(sys.metadata.links).toEqual([
      { url: 'https://a', title: 'A' },
      { url: 'https://b', title: 'B' },
    ]);
  });

  it('ignores and warns when overriding an entity from another tenant', () => {
    const log = logger();
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: { name: 'other-tenant', description: 'hijack attempt' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, log);
    const other = out.find(e => e.metadata.name === 'other-tenant')!;
    expect(other.metadata.description).toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('stamps a new entity with the tenant system and default owner', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: { name: 'merino-suggest' },
        spec: { type: 'openapi', lifecycle: 'production' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const api = out.find(e => e.metadata.name === 'merino-suggest')!;
    expect((api.spec as any).system).toBe('merino');
    expect((api.spec as any).owner).toBe('group:workgroups/merino');
    expect(out).toHaveLength(3);
  });

  it('keeps an explicit owner on a new entity but still forces system', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: { name: 'merino-suggest' },
        spec: { type: 'openapi', owner: 'group:workgroups/merino-api', system: 'wrong' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const api = out.find(e => e.metadata.name === 'merino-suggest')!;
    expect((api.spec as any).owner).toBe('group:workgroups/merino-api');
    expect((api.spec as any).system).toBe('merino'); // forced into this tenant
  });
});
