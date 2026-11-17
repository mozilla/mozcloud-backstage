import { mockServices } from '@backstage/backend-test-utils';
import { Entity, EntityLink } from '@backstage/catalog-model';
import {
  entityRef,
  belongsToTenant,
  dropInvalidIncidentAnnotations,
  mergeOverlayEntities,
  TenantScope,
} from './mergeOverlay';
import { INCIDENT_ANNOTATIONS } from '../transform/incident';

const scope: TenantScope = {
  appCode: 'merino',
  owner: 'group:workgroups/merino',
  location:
    'mozcloud:overlay:https://github.com/mozilla/webservices-infra/blob/main/merino/catalog-info.yaml',
};
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
    expect(
      entityRef({ kind: 'System', metadata: { name: 'Merino' } } as Entity),
    ).toBe('system:default/merino');
    expect(
      entityRef({
        kind: 'API',
        metadata: { name: 'x', namespace: 'NS' },
      } as Entity),
    ).toBe('api:ns/x');
  });
});

describe('belongsToTenant', () => {
  it('matches the tenant System by name', () => {
    expect(belongsToTenant(generated()[0], 'merino')).toBe(true);
  });
  it('matches an entity via spec.system', () => {
    const c = {
      kind: 'Component',
      metadata: { name: 'svc' },
      spec: { system: 'merino' },
    } as unknown as Entity;
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
          links: [
            { url: 'https://a', title: 'A dup' },
            { url: 'https://b', title: 'B' },
          ],
        },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const sys = out.find(e => e.metadata.name === 'merino')!;
    expect(sys.metadata.tags).toEqual([
      'webservices',
      'risk-high',
      'public-api',
    ]);
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
    expect(api.metadata.annotations).toEqual({
      'backstage.io/managed-by-location': scope.location,
      'backstage.io/managed-by-origin-location': scope.location,
    });
    expect(out).toHaveLength(3);
  });

  it('keeps an explicit owner on a new entity but still forces system', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: { name: 'merino-suggest' },
        spec: {
          type: 'openapi',
          owner: 'group:workgroups/merino-api',
          system: 'wrong',
        },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const api = out.find(e => e.metadata.name === 'merino-suggest')!;
    expect((api.spec as any).owner).toBe('group:workgroups/merino-api');
    expect((api.spec as any).system).toBe('merino'); // forced into this tenant
  });

  describe('incident fields', () => {
    const RUNBOOK = INCIDENT_ANNOTATIONS.runbook;
    const TENANT_RUNBOOK = 'https://tenant.example.com/runbooks';
    const OVERLAY_RUNBOOK = 'https://overlay.example.com/runbooks';

    /** `generated()` with the tenant's incident values set on the System. */
    const generatedWithIncident = (
      annotations: Record<string, string>,
      links: EntityLink[] = [],
    ): Entity[] => {
      const [system, other] = generated();
      system.metadata.annotations = {
        ...system.metadata.annotations,
        ...annotations,
      };
      system.metadata.links = [...(system.metadata.links ?? []), ...links];
      return [system, other];
    };

    const overlaySystem = (
      metadata: Record<string, unknown>,
      spec?: Record<string, unknown>,
    ): Entity =>
      ({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: { name: 'merino', ...metadata },
        ...(spec && { spec }),
      } as Entity);

    const merinoSystem = (entities: Entity[]) =>
      entities.find(e => e.kind === 'System' && e.metadata.name === 'merino')!;

    it('keeps the tenant value and warns when an overlay sets a different one', () => {
      const log = logger();

      const out = mergeOverlayEntities(
        generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }),
        [overlaySystem({ annotations: { [RUNBOOK]: OVERLAY_RUNBOOK } })],
        scope,
        log,
      );

      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        TENANT_RUNBOOK,
      );
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining(`${RUNBOOK} on system:default/merino`),
      );
    });

    it('does not warn when the overlay repeats the tenant value', () => {
      const log = logger();

      const out = mergeOverlayEntities(
        generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }),
        [overlaySystem({ annotations: { [RUNBOOK]: TENANT_RUNBOOK } })],
        scope,
        log,
      );

      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        TENANT_RUNBOOK,
      );
      expect(log.warn).not.toHaveBeenCalled();
    });

    it('uses the overlay value when the tenant leaves the key unset', () => {
      const log = logger();

      const out = mergeOverlayEntities(
        generated(),
        [overlaySystem({ annotations: { [RUNBOOK]: OVERLAY_RUNBOOK } })],
        scope,
        log,
      );

      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        OVERLAY_RUNBOOK,
      );
      expect(log.warn).not.toHaveBeenCalled();
    });

    it('lets the tenant value beat every duplicate overlay document', () => {
      const docs = [
        overlaySystem({
          annotations: { [RUNBOOK]: 'https://first.example.com' },
        }),
        overlaySystem({
          annotations: { [RUNBOOK]: 'https://second.example.com' },
        }),
      ];

      const out = mergeOverlayEntities(
        generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }),
        docs,
        scope,
        logger(),
      );

      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        TENANT_RUNBOOK,
      );
    });

    it('keeps last-writer-wins between overlay documents when the tenant is unset', () => {
      const docs = [
        overlaySystem({
          annotations: { [RUNBOOK]: 'https://first.example.com' },
        }),
        overlaySystem({
          annotations: { [RUNBOOK]: 'https://second.example.com' },
        }),
      ];

      const out = mergeOverlayEntities(generated(), docs, scope, logger());

      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        'https://second.example.com',
      );
    });

    it('drops only the overlay link that points at the rejected value', () => {
      const out = mergeOverlayEntities(
        generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }, [
          { url: TENANT_RUNBOOK, title: 'Runbooks', icon: 'docs' },
        ]),
        [
          overlaySystem({
            annotations: { [RUNBOOK]: OVERLAY_RUNBOOK },
            links: [
              { url: OVERLAY_RUNBOOK, title: 'Merino runbook' },
              { url: 'https://b', title: 'B' },
            ],
          }),
        ],
        scope,
        logger(),
      );

      expect(merinoSystem(out).metadata.links).toEqual([
        { url: 'https://a', title: 'A' },
        { url: TENANT_RUNBOOK, title: 'Runbooks', icon: 'docs' },
        { url: 'https://b', title: 'B' },
      ]);
    });

    it.each([
      ['an earlier document', true],
      ['a later document', false],
    ])(
      'drops the overlay link to a refused value when %s carries the link',
      (_label, linkFirst) => {
        const annotationDoc = overlaySystem({
          annotations: { [RUNBOOK]: OVERLAY_RUNBOOK },
        });
        const linkDoc = overlaySystem({
          links: [{ url: OVERLAY_RUNBOOK, title: 'Merino runbook' }],
        });

        const out = mergeOverlayEntities(
          generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }, [
            { url: TENANT_RUNBOOK, title: 'Runbooks', icon: 'docs' },
          ]),
          linkFirst ? [linkDoc, annotationDoc] : [annotationDoc, linkDoc],
          scope,
          logger(),
        );

        expect(merinoSystem(out).metadata.links).toEqual([
          { url: 'https://a', title: 'A' },
          { url: TENANT_RUNBOOK, title: 'Runbooks', icon: 'docs' },
        ]);
      },
    );

    it('keeps a tenant link even when its URL matches a refused overlay value', () => {
      const WIKI = 'https://tenant.example.com/wiki';

      const out = mergeOverlayEntities(
        generatedWithIncident(
          {
            [RUNBOOK]: TENANT_RUNBOOK,
            [INCIDENT_ANNOTATIONS.confluenceUrl]: WIKI,
          },
          [{ url: WIKI, title: 'Confluence', icon: 'docs' }],
        ),
        [overlaySystem({ annotations: { [RUNBOOK]: WIKI } })],
        scope,
        logger(),
      );

      expect(merinoSystem(out).metadata.links).toContainEqual({
        url: WIKI,
        title: 'Confluence',
        icon: 'docs',
      });
    });

    it('leaves a link alone when the refused value belongs to a key that has no link', () => {
      const PAGERDUTY = INCIDENT_ANNOTATIONS.escalationPagerdutyServiceId;
      const url = 'https://pagerduty.example.com/services/PABC';

      const out = mergeOverlayEntities(
        generatedWithIncident({ [PAGERDUTY]: 'PTENANT1' }),
        [
          overlaySystem({
            annotations: { [PAGERDUTY]: url },
            links: [{ url, title: 'PagerDuty' }],
          }),
        ],
        scope,
        logger(),
      );

      expect(merinoSystem(out).metadata.links).toContainEqual({
        url,
        title: 'PagerDuty',
      });
    });

    it('leaves a Component runbook alone when only the System has a tenant value', () => {
      const component = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'merino-web' },
        spec: { type: 'service', system: 'merino' },
      } as Entity;

      const out = mergeOverlayEntities(
        [...generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }), component],
        [
          {
            ...component,
            metadata: {
              name: 'merino-web',
              annotations: { [RUNBOOK]: OVERLAY_RUNBOOK },
            },
          },
        ],
        scope,
        logger(),
      );

      const merged = out.find(e => e.metadata.name === 'merino-web')!;
      expect(merged.metadata.annotations?.[RUNBOOK]).toBe(OVERLAY_RUNBOOK);
      expect(merinoSystem(out).metadata.annotations?.[RUNBOOK]).toBe(
        TENANT_RUNBOOK,
      );
    });

    it('still lets an overlay set spec.owner over the tenant owner', () => {
      const out = mergeOverlayEntities(
        generatedWithIncident({ [RUNBOOK]: TENANT_RUNBOOK }),
        [overlaySystem({}, { owner: 'group:workgroups/merino-overlay' })],
        scope,
        logger(),
      );

      expect((merinoSystem(out).spec as any).owner).toBe(
        'group:workgroups/merino-overlay',
      );
    });
  });
});

describe('dropInvalidIncidentAnnotations', () => {
  const entity = (
    kind: string,
    name: string,
    annotations: Record<string, unknown>,
    links?: EntityLink[],
  ): Entity =>
    ({
      apiVersion: 'backstage.io/v1alpha1',
      kind,
      metadata: { name, annotations, ...(links && { links }) },
    } as Entity);

  it('drops an invalid value on any kind of entity and warns with its ref and key', () => {
    const log = logger();
    const entities = [
      entity('System', 'merino', {
        [INCIDENT_ANNOTATIONS.runbook]: 'http://insecure.example.com',
      }),
      entity('Component', 'merino-web', {
        [INCIDENT_ANNOTATIONS.escalationSlackChannelId]: '#general',
      }),
      entity('API', 'merino-api', {
        [INCIDENT_ANNOTATIONS.escalationPagerdutyServiceId]: 'not an id',
      }),
    ];

    const out = dropInvalidIncidentAnnotations(entities, log);

    expect(out.map(e => e.metadata.annotations)).toEqual([{}, {}, {}]);
    expect(log.warn).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `${INCIDENT_ANNOTATIONS.runbook} on system:default/merino`,
      ),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('component:default/merino-web'),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('api:default/merino-api'),
    );
  });

  it('drops a value that is not a string', () => {
    const log = logger();

    const [out] = dropInvalidIncidentAnnotations(
      [entity('System', 'merino', { [INCIDENT_ANNOTATIONS.runbook]: 42 })],
      log,
    );

    expect(out.metadata.annotations).toEqual({});
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('expected a string'),
    );
  });

  it('keeps valid values and unrelated annotations, and does not mutate its input', () => {
    const log = logger();
    const annotations = {
      [INCIDENT_ANNOTATIONS.runbook]: 'https://example.com/runbooks',
      [INCIDENT_ANNOTATIONS.escalationPagerdutyServiceId]: 'PABC123',
      [INCIDENT_ANNOTATIONS.escalationSlackChannelId]: 'not valid',
      'mozilla.org/function': 'webservices',
    };
    const input = [entity('System', 'merino', annotations)];

    const [out] = dropInvalidIncidentAnnotations(input, log);

    expect(out.metadata.annotations).toEqual({
      [INCIDENT_ANNOTATIONS.runbook]: 'https://example.com/runbooks',
      [INCIDENT_ANNOTATIONS.escalationPagerdutyServiceId]: 'PABC123',
      'mozilla.org/function': 'webservices',
    });
    expect(input[0].metadata.annotations).toEqual(annotations);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('drops the link that points at a dropped value and keeps the others', () => {
    const insecure = 'http://insecure.example.com';
    const links = [
      { url: insecure, title: 'Runbook' },
      { url: 'https://ok.example.com', title: 'OK' },
    ];
    const input = [
      entity(
        'System',
        'merino',
        { [INCIDENT_ANNOTATIONS.runbook]: insecure },
        links,
      ),
    ];

    const [out] = dropInvalidIncidentAnnotations(input, logger());

    expect(out.metadata.links).toEqual([
      { url: 'https://ok.example.com', title: 'OK' },
    ]);
    expect(input[0].metadata.links).toEqual(links);
  });

  it('leaves a link alone when the dropped value belongs to a key that has no link', () => {
    const url = 'https://example.com/x';

    const [out] = dropInvalidIncidentAnnotations(
      [
        entity(
          'System',
          'merino',
          { [INCIDENT_ANNOTATIONS.escalationSlackChannelId]: url },
          [{ url, title: 'X' }],
        ),
      ],
      logger(),
    );

    expect(out.metadata.annotations).toEqual({});
    expect(out.metadata.links).toEqual([{ url, title: 'X' }]);
  });

  it('does not warn when every value is valid', () => {
    const log = logger();

    dropInvalidIncidentAnnotations(
      [
        entity('System', 'merino', {
          [INCIDENT_ANNOTATIONS.confluenceUrl]: 'https://example.com/wiki',
        }),
      ],
      log,
    );

    expect(log.warn).not.toHaveBeenCalled();
  });
});
