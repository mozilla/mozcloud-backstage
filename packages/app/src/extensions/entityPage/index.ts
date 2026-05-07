import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  chartCard,
  deploymentCard,
  diagramContent,
  gcpProjectCard,
  mozillaMetadataCard,
} from './extensions';

/**
 * Frontend module that customizes the entity page surface area provided
 * by `@backstage/plugin-catalog/alpha`. Adds Mozilla-specific cards
 * (System metadata, GCP project info) on Overview, and registers a
 * dedicated Diagram tab for the relations graph.
 *
 * The default catalog-graph card on Overview is disabled via
 * app-config.yaml (`entity-card:catalog-graph/relations: false`) so the
 * graph only lives in the Diagram tab — Overview stays compact.
 */
export const catalogEntityPageModule = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    mozillaMetadataCard,
    gcpProjectCard,
    chartCard,
    deploymentCard,
    diagramContent,
  ],
});
