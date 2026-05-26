import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load } from 'js-yaml';
import { TenantRowSchema } from './schema';
import { tenantToEntities } from './tenantToEntities';
import { workgroupRef } from './refs';

const FIXTURE_LOCATION = 'file:src/__fixtures__/<name>.yaml';

const loadFixture = (name: string) => {
  const raw = readFileSync(
    resolve(__dirname, '..', '__fixtures__', `${name}.yaml`),
    'utf8',
  );
  const parsed = load(raw);
  return TenantRowSchema.parse(parsed);
};

describe('tenantToEntities', () => {
  describe('single-chart tenant (backstage)', () => {
    const tenant = loadFixture('backstage');
    const entities = tenantToEntities(tenant, FIXTURE_LOCATION);
    const byKind = (kind: string) => entities.filter(e => e.kind === kind);

    it('emits a Domain for the tenant function owned by the platform workgroup', () => {
      const domains = byKind('Domain');
      expect(domains).toHaveLength(1);
      expect(domains[0].metadata.name).toBe('webservices');
      expect(domains[0].spec).toMatchObject({
        owner: 'group:workgroups/platform',
      });
    });

    it('emits one System with workgroup-namespaced owner', () => {
      const systems = byKind('System');
      expect(systems).toHaveLength(1);
      expect(systems[0].metadata.name).toBe('backstage');
      expect(systems[0].spec).toMatchObject({
        owner: 'group:workgroups/backstage',
        domain: 'webservices',
      });
      expect(systems[0].metadata.tags).toEqual(['webservices', 'risk-high']);
    });

    it('annotates Systems with backstage.io/source-location pointing at the tenant YAML', () => {
      const system = byKind('System')[0];
      expect(
        system.metadata.annotations?.['backstage.io/source-location'],
      ).toBe(
        'url:https://github.com/mozilla/global-platform-admin/blob/main/tenants/backstage.yaml',
      );
    });

    it('emits one gcp-project Resource per realm', () => {
      const resources = byKind('Resource');
      expect(resources.map(r => r.metadata.name).sort()).toEqual([
        'moz-fx-backstage-nonprod',
        'moz-fx-backstage-prod',
      ]);
      const nonprod = resources.find(
        r => r.metadata.name === 'moz-fx-backstage-nonprod',
      )!;
      expect(nonprod.metadata.annotations?.['mozilla.org/realm']).toBe(
        'nonprod',
      );
      expect(nonprod.metadata.annotations?.['mozilla.org/environments']).toBe(
        'stage',
      );
      expect(nonprod.spec).toMatchObject({
        type: 'gcp-project',
        system: 'backstage',
      });
    });

    it('does not emit Group entities (workgroup provider owns that namespace)', () => {
      expect(byKind('Group')).toHaveLength(0);
    });

    it('does not emit Component entities (chartToEntities owns those)', () => {
      expect(byKind('Component')).toHaveLength(0);
    });

    it('does not emit any entitlement Resources for tenants without entitlements', () => {
      const entResources = byKind('Resource').filter(
        r => (r.spec as { type?: string }).type === 'gcp-entitlement',
      );
      expect(entResources).toHaveLength(0);
    });
  });

  describe('tenant with entitlements (fxa)', () => {
    const tenant = loadFixture('fxa');
    const entities = tenantToEntities(tenant, FIXTURE_LOCATION);
    const entResources = entities.filter(
      e =>
        e.kind === 'Resource' &&
        (e.spec as { type?: string }).type === 'gcp-entitlement',
    );

    it('emits one Resource per additional_entitlement', () => {
      expect(entResources.map(r => r.metadata.name).sort()).toEqual([
        'fxa-entitlement-admin-ent',
        'fxa-entitlement-secret-add-access',
      ]);
    });

    it('records the principal workgroups via dependsOn', () => {
      const adminEnt = entResources.find(
        r => r.metadata.name === 'fxa-entitlement-admin-ent',
      )!;
      expect((adminEnt.spec as { dependsOn?: string[] }).dependsOn).toEqual([
        'group:workgroups/fxa-developers',
      ]);
    });

    it('preserves risk_uuid as an annotation', () => {
      const system = entities.find(e => e.kind === 'System')!;
      expect(system.metadata.annotations?.['mozilla.org/risk-uuid']).toBe(
        'd189d104-70e5-444a-815b-a933e66f9bf0',
      );
    });
  });

  describe('schema validation', () => {
    it('rejects rows missing required globals fields', () => {
      const malformed = { globals: { app_code: 'whatever' }, realms: {} };
      expect(() => TenantRowSchema.parse(malformed)).toThrow();
    });

    it('passes through unknown fields without erroring', () => {
      const withExtras = {
        globals: {
          app_code: 'tinyapp',
          function: 'webservices',
          risk_level: 'low',
          workgroups: ['tinyteam'],
          some_future_field: 42,
        },
        realms: {},
      };
      expect(() => TenantRowSchema.parse(withExtras)).not.toThrow();
    });
  });

  describe('annotations', () => {
    it('always includes the managed-by-location annotations', () => {
      const tenant = loadFixture('backstage');
      const entities = tenantToEntities(tenant, FIXTURE_LOCATION);
      for (const e of entities) {
        expect(
          e.metadata.annotations?.['backstage.io/managed-by-location'],
        ).toBe(FIXTURE_LOCATION);
        expect(
          e.metadata.annotations?.['backstage.io/managed-by-origin-location'],
        ).toBe(FIXTURE_LOCATION);
      }
    });

    it('drops undefined-valued annotations rather than emitting them blank', () => {
      const tenant = loadFixture('backstage');
      const entities = tenantToEntities(tenant, FIXTURE_LOCATION);
      const system = entities.find(e => e.kind === 'System')!;
      // backstage.yaml has no risk_uuid set, so the annotation must not appear
      expect(system.metadata.annotations).not.toHaveProperty(
        'mozilla.org/risk-uuid',
      );
    });
  });
});

describe('workgroupRef', () => {
  it.each([
    ['workgroup:fxa/developers', 'group:workgroups/fxa-developers'],
    ['workgroup:backstage/admins', 'group:workgroups/backstage-admins'],
    ['workgroup:standalone', 'group:workgroups/standalone'],
    ['fxa/developers', 'group:workgroups/fxa-developers'],
  ])('%s -> %s', (input, expected) => {
    expect(workgroupRef(input)).toBe(expected);
  });
});
