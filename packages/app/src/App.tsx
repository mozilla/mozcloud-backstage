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
import { techDocsReportIssueAddonModule } from '@backstage/plugin-techdocs-module-addons-contrib/alpha';

import {
  scmIntegrationsApi,
  scmAuthApi,
  gleanAnalyticsApi,
} from './extensions/apis';
import { signInPageExtension } from './extensions/signInPage';
import { sidebarExtension } from './extensions/sidebar';
import {
  alertDisplayElement,
  oauthRequestDialogElement,
} from './extensions/rootElements';

const appModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    scmIntegrationsApi,
    scmAuthApi,
    gleanAnalyticsApi,
    signInPageExtension,
    sidebarExtension,
    alertDisplayElement,
    oauthRequestDialogElement,
  ],
});

const features: FrontendFeature[] = [
  appModule,
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
