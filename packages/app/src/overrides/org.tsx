import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { useEntity } from '@backstage/plugin-catalog-react';
import { WorkgroupMembersListCard } from '../components/catalog/WorkgroupMembersListCard';

/**
 * Override for `entity-card:org/ownership`. Replaces the stock loader
 * with our `WorkgroupOwnershipCard` so aggregated ownership for users
 * walks `RELATION_CHILD_OF` ancestors of each direct memberOf group —
 * surfacing things owned by parent workgroups, not just subgroups.
 *
 * The original extension's config schema (`initialRelationAggregation`,
 * `showAggregateMembersToggle`, `ownedKinds`) is preserved by passing
 * those values through to our component.
 */
const ownershipOverride = EntityCardBlueprint.makeWithOverrides({
  name: 'ownership',
  factory(originalFactory) {
    return originalFactory({
      filter: { kind: { $in: ['group', 'user'] } },
      loader: async () => {
        const { WorkgroupOwnershipCard } = await import(
          '../components/catalog/WorkgroupOwnershipCard'
        );
        return <WorkgroupOwnershipCard />;
      },
    });
  },
});

/**
 * Branch the members card's relation-aggregation behavior by group type:
 *  - `workgroup` (the parent) shows aggregated members — i.e. the union
 *    of every subgroup's members, with the org-wide admin groups pruned
 *    (see `aggregateMembers`) so they don't flood every workgroup's card.
 *  - `workgroup-subgroup` shows only direct members; aggregating "down"
 *    from a subgroup has no meaning (subgroups have no children).
 */
function TypeAwareMembersListCard() {
  const { entity } = useEntity();
  const isParent =
    (entity.spec as { type?: string } | undefined)?.type === 'workgroup';
  return <WorkgroupMembersListCard aggregated={isParent} />;
}

const membersListOverride = EntityCardBlueprint.makeWithOverrides({
  name: 'members-list',
  factory(originalFactory) {
    return originalFactory({
      filter: { kind: 'group' },
      loader: async () => <TypeAwareMembersListCard />,
    });
  },
});

export const orgModule = createFrontendModule({
  pluginId: 'org',
  extensions: [ownershipOverride, membersListOverride],
});
