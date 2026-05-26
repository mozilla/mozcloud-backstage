import { Grid } from '@backstage/ui';
import { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import {
  EntityContentLayoutBlueprint,
  EntityContentLayoutProps,
} from '@backstage/plugin-catalog-react/alpha';

/**
 * Two-column Overview layout, copied verbatim from the Backstage demo
 * (https://github.com/backstage/demo/blob/master/packages/app/src/components/catalog/EntityOverviewLayout.tsx).
 *
 * Cards are split by their declared `type`:
 *   - `'info'` cards stack in the left column.
 *   - `'content'` cards stack in the right column.
 *   - Untyped cards fall into a separate full-width row below.
 *
 * Replaces the stock catalog Overview grid, which gives every card the
 * same column treatment regardless of size or purpose.
 */
const OverviewLayout = (props: EntityContentLayoutProps) => {
  const infoCards = props.cards.filter(c => c.type === 'info');
  const contentCards = props.cards.filter(c => c.type === 'content');
  const ungroupedCards = props.cards.filter(c => !c.type);

  return (
    <Grid.Root columns="1" gap="3">
      <Grid.Item>
        <Grid.Root columns={{ initial: '1', md: '2' }} gap="3">
          <Grid.Item>
            <Grid.Root columns="1" gap="3">
              {infoCards.map((card, i) => (
                <Grid.Item key={i}>{card.element}</Grid.Item>
              ))}
            </Grid.Root>
          </Grid.Item>
          <Grid.Item>
            <Grid.Root columns="1" gap="3">
              {contentCards.map((card, i) => (
                <Grid.Item key={i}>{card.element}</Grid.Item>
              ))}
            </Grid.Root>
          </Grid.Item>
        </Grid.Root>
      </Grid.Item>
      {ungroupedCards.length > 0 && (
        <Grid.Item>
          <Grid.Root columns={{ initial: '1', md: '2' }} gap="3">
            {ungroupedCards.map((card, i) => (
              <Grid.Item key={i}>{card.element}</Grid.Item>
            ))}
          </Grid.Root>
        </Grid.Item>
      )}
    </Grid.Root>
  );
};

export const entityOverviewLayoutExtension: ExtensionDefinition =
  EntityContentLayoutBlueprint.make({
    name: 'overview',
    params: {
      loader: async () => OverviewLayout,
    },
  });
