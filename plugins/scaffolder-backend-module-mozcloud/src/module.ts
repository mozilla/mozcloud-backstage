import { createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
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
      deps: { scaffolder: scaffolderActionsExtensionPoint },
      async init({ scaffolder }) {
        scaffolder.addActions(
          createReadTenantAction(),
          createRunCopierAction(),
          createAddChartAction(),
        );
      },
    });
  },
});
