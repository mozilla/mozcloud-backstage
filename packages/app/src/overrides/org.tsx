import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';

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

export const orgModule = createFrontendModule({
  pluginId: 'org',
  extensions: [ownershipOverride],
});
