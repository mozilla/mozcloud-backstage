import { createApp } from '@backstage/frontend-defaults';
import {
  createFrontendModule,
  FrontendFeature,
} from '@backstage/frontend-plugin-api';

import catalogPlugin from '@backstage/plugin-catalog/alpha';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import catalogImportPlugin from '@backstage/plugin-catalog-import/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import orgPlugin from '@backstage/plugin-org/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import githubActionsPlugin from '@backstage-community/plugin-github-actions/alpha';
import homePlugin from '@backstage/plugin-home/alpha';
import gleanPlugin from 'backstage-plugin-glean';
import { techDocsReportIssueAddonModule } from '@backstage/plugin-techdocs-module-addons-contrib/alpha';

import { scmIntegrationsApi, scmAuthApi } from './extensions/apis';
import { signInPageExtension } from './extensions/signInPage';
import { sidebarExtension } from './extensions/sidebar';
import {
  alertDisplayElement,
  oauthRequestDialogElement,
} from './extensions/rootElements';
import { homePageLayout } from './extensions/homePage';
import { catalogEntityPageModule } from './extensions/entityPage';

const appModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    scmIntegrationsApi,
    scmAuthApi,
    signInPageExtension,
    sidebarExtension,
    alertDisplayElement,
    oauthRequestDialogElement,
  ],
});

const homeModule = createFrontendModule({
  pluginId: 'home',
  extensions: [homePageLayout],
});

const features: FrontendFeature[] = [
  appModule,
  homeModule,
  catalogEntityPageModule,
  catalogPlugin,
  catalogGraphPlugin,
  catalogImportPlugin,
  scaffolderPlugin,
  techdocsPlugin,
  techDocsReportIssueAddonModule,
  searchPlugin,
  apiDocsPlugin,
  orgPlugin,
  userSettingsPlugin,
  kubernetesPlugin,
  githubActionsPlugin,
  homePlugin,
  gleanPlugin,
];

const app = createApp({
  features,
  bindRoutes({ bind }) {
    bind(catalogPlugin.externalRoutes, {
      createComponent: scaffolderPlugin.routes.root,
      viewTechDoc: techdocsPlugin.routes.docRoot,
      createFromTemplate: scaffolderPlugin.routes.selectedTemplate,
    });
    bind(apiDocsPlugin.externalRoutes, {
      registerApi: catalogImportPlugin.routes.importPage,
    });
    bind(scaffolderPlugin.externalRoutes, {
      registerComponent: catalogImportPlugin.routes.importPage,
      viewTechDoc: techdocsPlugin.routes.docRoot,
    });
    bind(orgPlugin.externalRoutes, {
      catalogIndex: catalogPlugin.routes.catalogIndex,
    });
  },
});

export default app.createRoot();
