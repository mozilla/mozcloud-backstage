import { RELATION_MEMBER_OF } from '@backstage/catalog-model';
import { GcpLinkedOwnershipResolver } from './authModuleGcpLinkedOwnership';

const person = (name: string, groups: string[] = []) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'User',
  metadata: { name, namespace: 'people' },
  relations: groups.map(g => ({ type: RELATION_MEMBER_OF, targetRef: g })),
});

const gcpUser = (name: string, groups: string[]) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'User',
  metadata: { name, namespace: 'gcp' },
  relations: groups.map(g => ({ type: RELATION_MEMBER_OF, targetRef: g })),
});

const makeResolver = (gcpEntities: Record<string, any>) => {
  const catalog = {
    getEntityByRef: async (ref: string) => gcpEntities[ref] ?? undefined,
  } as any;
  const auth = { getOwnServiceCredentials: async () => ({}) } as any;
  return new GcpLinkedOwnershipResolver(catalog, auth);
};

describe('GcpLinkedOwnershipResolver', () => {
  it('unions the gcp identity groups (same local-part) into ownership', async () => {
    const r = makeResolver({
      'user:gcp/wstuckey': gcpUser('wstuckey', [
        'group:workgroups/cloud-engineering-admins',
      ]),
    });
    const { ownershipEntityRefs } = await r.resolveOwnershipEntityRefs(
      person('wstuckey', ['group:people/all-staff']) as any,
    );
    expect(ownershipEntityRefs).toEqual(
      expect.arrayContaining([
        'user:people/wstuckey',
        'group:people/all-staff',
        'group:workgroups/cloud-engineering-admins',
      ]),
    );
  });

  it('applies the static override (jbuckley -> jbuck)', async () => {
    const r = makeResolver({
      'user:gcp/jbuck': gcpUser('jbuck', [
        'group:workgroups/cloud-engineering-admins',
      ]),
    });
    const { ownershipEntityRefs } = await r.resolveOwnershipEntityRefs(
      person('jbuckley') as any,
    );
    expect(ownershipEntityRefs).toContain(
      'group:workgroups/cloud-engineering-admins',
    );
  });

  it('returns only default ownership when no gcp entity exists', async () => {
    const r = makeResolver({});
    const { ownershipEntityRefs } = await r.resolveOwnershipEntityRefs(
      person('nobody', ['group:people/all-staff']) as any,
    );
    expect(ownershipEntityRefs.sort()).toEqual(
      ['group:people/all-staff', 'user:people/nobody'].sort(),
    );
  });
});
