import { createApp } from '@backstage/frontend-defaults';
import { FrontendFeature } from '@backstage/frontend-plugin-api';

import catalogPlugin from '@backstage/plugin-catalog/alpha';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import catalogImportPlugin from '@backstage/plugin-catalog-import/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
// import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import orgPlugin from '@backstage/plugin-org/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import homePlugin from '@backstage/plugin-home/alpha';
import authPlugin from '@backstage/plugin-auth';
import gleanPlugin from 'backstage-plugin-glean';
import grafanaPlugin from '@backstage-community/plugin-grafana/alpha';
// import { techDocsReportIssueAddonModule } from '@backstage/plugin-techdocs-module-addons-contrib/alpha';

import { appModule } from './overrides/app';
import { catalogModule } from './overrides/catalog';
import { homeModule } from './overrides/home';
import { orgModule } from './overrides/org';

const features: FrontendFeature[] = [
  appModule,
  homeModule,
  catalogModule,
  orgModule,
  catalogPlugin,
  catalogGraphPlugin,
  catalogImportPlugin,
  scaffolderPlugin,
  // techdocsPlugin,
  // techDocsReportIssueAddonModule,
  searchPlugin,
  apiDocsPlugin,
  orgPlugin,
  userSettingsPlugin,
  kubernetesPlugin,
  homePlugin,
  authPlugin,
  gleanPlugin,
  grafanaPlugin,
];

const app = createApp({
  features,
  bindRoutes({ bind }) {
    bind(catalogPlugin.externalRoutes, {
      createComponent: scaffolderPlugin.routes.root,
      createFromTemplate: scaffolderPlugin.routes.selectedTemplate,
    });
    bind(apiDocsPlugin.externalRoutes, {
      registerApi: catalogImportPlugin.routes.importPage,
    });
    bind(scaffolderPlugin.externalRoutes, {
      registerComponent: catalogImportPlugin.routes.importPage,
    });
    bind(orgPlugin.externalRoutes, {
      catalogIndex: catalogPlugin.routes.catalogIndex,
    });
  },
});

export default app.createRoot();
