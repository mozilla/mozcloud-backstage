import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { createAddChartAction } from './actions/addChart';
import { createReadTenantAction } from './actions/readTenant';
import { createRunCopierAction } from './actions/runCopier';

/**
 * Registers the mozcloud tenant-chart scaffolder actions
 * (`mozcloud:tenant:read`, `run:copier`, `mozcloud:tenant:add-chart`) with
 * the scaffolder backend plugin.
 */
export const scaffolderModuleMozcloud = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'mozcloud',
  register(reg) {
    reg.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ scaffolder, config }) {
        const integrations = ScmIntegrations.fromConfig(config);
        const githubCredentials =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);
        scaffolder.addActions(
          createReadTenantAction(),
          createRunCopierAction({ githubCredentials }),
          createAddChartAction(),
        );
      },
    });
  },
});
