import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { entityOverviewLayoutExtension } from '../components/catalog/EntityOverviewLayout';

const mozillaMetadataCard = EntityCardBlueprint.make({
  name: 'mozilla-metadata',
  params: {
    filter: { kind: 'system' },
    type: 'info',
    loader: async () => {
      const { MozillaMetadataCard } = await import(
        '../components/catalog/MozillaMetadataCard'
      );
      return <MozillaMetadataCard />;
    },
  },
});

const gcpProjectCard = EntityCardBlueprint.make({
  name: 'gcp-project',
  params: {
    filter: { kind: 'resource', 'spec.type': 'gcp-project' },
    type: 'info',
    loader: async () => {
      const { GcpProjectCard } = await import(
        '../components/catalog/GcpProjectCard'
      );
      return <GcpProjectCard />;
    },
  },
});

const chartCard = EntityCardBlueprint.make({
  name: 'mozcloud-chart',
  params: {
    filter: {
      kind: 'component',
      'spec.type': 'service',
      'metadata.annotations.mozilla.org/chart-name': { $exists: true },
    },
    type: 'content',
    loader: async () => {
      const { ChartCard } = await import('../components/catalog/ChartCard');
      return <ChartCard />;
    },
  },
});

const deploymentCard = EntityCardBlueprint.make({
  name: 'mozcloud-deployment',
  params: {
    filter: { kind: 'component', 'spec.type': 'helm-deployment' },
    type: 'info',
    loader: async () => {
      const { DeploymentCard } = await import(
        '../components/catalog/DeploymentCard'
      );
      return <DeploymentCard />;
    },
  },
});

const diagramContent = EntityContentBlueprint.make({
  name: 'diagram',
  params: {
    path: '/diagram',
    title: 'Diagram',
    loader: async () => {
      const { DiagramContent } = await import(
        '../components/catalog/DiagramContent'
      );
      return <DiagramContent />;
    },
  },
});

/**
 * Overrides for the catalog plugin. Adds Mozilla-specific cards (System
 * metadata, GCP project info, chart/deployment details) on Overview, and
 * registers a dedicated Diagram tab for the relations graph.
 *
 * The default catalog-graph card on Overview is disabled via
 * app-config.yaml (`entity-card:catalog-graph/relations: false`) so the
 * graph only lives in the Diagram tab — Overview stays compact.
 *
 * Workgroup membership uses the stock org plugin Members card. Subgroup
 * entities deliberately keep `spec.children = []` so the card's
 * "Include subgroups" aggregation (defaulted on via app-config) walks
 * the workgroup -> subgroup hierarchy only, without leaking into
 * cross-workgroup composition refs.
 */
export const catalogModule = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    entityOverviewLayoutExtension,
    mozillaMetadataCard,
    gcpProjectCard,
    chartCard,
    deploymentCard,
    diagramContent,
  ],
});
