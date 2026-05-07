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

export const chartCard = EntityCardBlueprint.make({
  name: 'mozcloud-chart',
  params: {
    filter:
      'kind:component,spec.type:service,metadata.annotations.mozilla.org/chart-name',
    type: 'info',
    loader: async () => {
      const { ChartCard } = await import('./ChartCard');
      return <ChartCard />;
    },
  },
});

export const deploymentCard = EntityCardBlueprint.make({
  name: 'mozcloud-deployment',
  params: {
    filter: 'kind:component,spec.type:helm-deployment',
    type: 'info',
    loader: async () => {
      const { DeploymentCard } = await import('./DeploymentCard');
      return <DeploymentCard />;
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
