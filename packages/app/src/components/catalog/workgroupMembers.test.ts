import { Entity } from '@backstage/catalog-model';
import {
  aggregateMembers,
  shouldPrune,
  MembersCatalog,
} from './workgroupMembers';

const group = (name: string, children: string[] = []): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name, namespace: 'workgroups' },
  spec: { type: 'workgroup-subgroup' },
  relations: children.map(c => ({ type: 'parentOf', targetRef: c })),
});

const user = (name: string, memberOf: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'User',
  metadata: { name, namespace: 'people' },
  relations: memberOf.map(g => ({ type: 'memberOf', targetRef: g })),
});

// Fake catalog: a fixed set of group + user entities.
const makeCatalog = (groups: Entity[], users: Entity[]): MembersCatalog => ({
  async getEntityByRef(ref) {
    const s =
      typeof ref === 'string'
        ? ref
        : `${ref.kind}:${ref.namespace}/${ref.name}`.toLowerCase();
    return groups.find(
      g =>
        `group:${g.metadata.namespace}/${g.metadata.name}`.toLowerCase() === s,
    );
  },
  async getEntities({ filter }) {
    const wanted = ([] as string[]).concat(
      (filter['relations.memberof'] as string[] | string) ?? [],
    );
    const items = users.filter(u =>
      (u.relations ?? []).some(
        r => r.type === 'memberOf' && wanted.includes(r.targetRef),
      ),
    );
    return { items };
  },
});

describe('shouldPrune', () => {
  it('prunes for a normal workgroup, not for excluded groups or their parents', () => {
    expect(shouldPrune(group('merino'))).toBe(true);
    expect(shouldPrune(group('cloud-engineering-admins'))).toBe(false);
    expect(shouldPrune(group('sre-admins'))).toBe(false);
    expect(shouldPrune(group('cloud-engineering'))).toBe(false);
    expect(shouldPrune(group('sre'))).toBe(false);
  });
});

describe('aggregateMembers', () => {
  // merino (parent) -> merino-admins -> cloud-engineering-admins (composed in)
  const groups = [
    group('merino', ['group:workgroups/merino-admins']),
    group('merino-admins', ['group:workgroups/cloud-engineering-admins']),
    group('cloud-engineering-admins'),
    group('cloud-engineering', ['group:workgroups/cloud-engineering-admins']),
  ];
  const users = [
    user('alice', ['group:workgroups/merino-admins']),
    user('carol', ['group:workgroups/cloud-engineering-admins']),
  ];
  const catalog = makeCatalog(groups, users);

  it('excludes cloud-engineering-admins users from a normal workgroup aggregate', async () => {
    const members = await aggregateMembers(groups[0], catalog, true);
    const names = members.map(m => m.metadata.name).sort();
    expect(names).toEqual(['alice']); // carol pruned
  });

  it('includes them when the admin group is viewed directly', async () => {
    const members = await aggregateMembers(groups[2], catalog, true);
    expect(members.map(m => m.metadata.name)).toEqual(['carol']);
  });

  it('includes them when the parent workgroup is viewed', async () => {
    const members = await aggregateMembers(groups[3], catalog, true);
    expect(members.map(m => m.metadata.name)).toEqual(['carol']);
  });

  it('still shows a pruned-group user if they are also a direct member', async () => {
    const catalog2 = makeCatalog(groups, [
      ...users,
      user('carol', [
        'group:workgroups/cloud-engineering-admins',
        'group:workgroups/merino',
      ]),
    ]);
    const members = await aggregateMembers(groups[0], catalog2, true);
    expect(members.map(m => m.metadata.name).sort()).toEqual([
      'alice',
      'carol',
    ]);
  });
});
