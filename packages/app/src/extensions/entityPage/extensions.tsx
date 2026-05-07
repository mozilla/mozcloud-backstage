import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';

export const mozillaMetadataCard = EntityCardBlueprint.make({
  name: 'mozilla-metadata',
  params: {
    filter: 'kind:system',
    type: 'info',
    loader: async () => {
      const { MozillaMetadataCard } = await import('./MozillaMetadataCard');
      return <MozillaMetadataCard />;
    },
  },
});

export const gcpProjectCard = EntityCardBlueprint.make({
  name: 'gcp-project',
  params: {
    filter: 'kind:resource,spec.type:gcp-project',
    type: 'info',
    loader: async () => {
      const { GcpProjectCard } = await import('./GcpProjectCard');
      return <GcpProjectCard />;
    },
  },
});

export const diagramContent = EntityContentBlueprint.make({
  name: 'diagram',
  params: {
    path: '/diagram',
    title: 'Diagram',
    loader: async () => {
      const { DiagramContent } = await import('./DiagramContent');
      return <DiagramContent />;
    },
  },
});
