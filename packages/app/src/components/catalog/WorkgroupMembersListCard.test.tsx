import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef, entityRouteRef } from '@backstage/plugin-catalog-react';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { WorkgroupMembersListCard } from './WorkgroupMembersListCard';

const merino: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name: 'merino', namespace: 'workgroups' },
  spec: { type: 'workgroup' },
  relations: [
    { type: 'parentOf', targetRef: 'group:workgroups/merino-admins' },
  ],
};

const catalogApi = {
  getEntityByRef: async (ref: any) => {
    const s =
      typeof ref === 'string'
        ? ref
        : `${ref.kind}:${ref.namespace}/${ref.name}`;
    if (s.toLowerCase() === 'group:workgroups/merino') return merino;
    if (s.toLowerCase() === 'group:workgroups/merino-admins')
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Group',
        metadata: { name: 'merino-admins', namespace: 'workgroups' },
        relations: [
          {
            type: 'parentOf',
            targetRef: 'group:workgroups/cloud-engineering-admins',
          },
        ],
      };
    return undefined;
  },
  getEntities: async ({ filter }: any) => {
    const wanted: string[] = ([] as string[]).concat(
      filter['relations.memberof'] ?? [],
    );
    const alice = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: { name: 'alice', namespace: 'people' },
      spec: { profile: { displayName: 'Alice A' } },
      relations: [
        { type: 'memberOf', targetRef: 'group:workgroups/merino-admins' },
      ],
    };
    // Carol is only reachable via the pruned cloud-engineering-admins branch.
    // If pruning works, that branch is never descended into, so this catalog
    // query is never made for it and Carol is never rendered.
    const carol = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: { name: 'carol', namespace: 'people' },
      spec: { profile: { displayName: 'Carol C' } },
      relations: [
        {
          type: 'memberOf',
          targetRef: 'group:workgroups/cloud-engineering-admins',
        },
      ],
    };
    const items: unknown[] = [];
    if (wanted.includes('group:workgroups/merino-admins')) items.push(alice);
    if (wanted.includes('group:workgroups/cloud-engineering-admins'))
      items.push(carol);
    return { items };
  },
} as any;

it('renders aggregated members and omits pruned admin-group users', async () => {
  await renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, catalogApi]]}>
      <EntityProvider entity={merino}>
        <WorkgroupMembersListCard aggregated />
      </EntityProvider>
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/catalog/:namespace/:kind/:name': entityRouteRef,
      },
    },
  );
  // Direct/other-subgroup member shows.
  expect(await screen.findByText('Alice A')).toBeInTheDocument();
  // cloud-engineering-admins is pruned from the descent → its members are
  // never fetched or rendered on this (non-exempt) workgroup's page.
  expect(screen.queryByText('Carol C')).not.toBeInTheDocument();
});
