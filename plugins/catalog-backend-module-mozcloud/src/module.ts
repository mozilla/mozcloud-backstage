import {
  coreServices,
  createBackendModule,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { MozcloudWorkgroupEntityProvider } from './MozcloudWorkgroupEntityProvider';
import { createSource } from './sources/createSource';

/**
 * Backstage backend module that registers the mozcloud tenant +
 * (placeholder) workgroup catalog entity providers under the existing
 * catalog plugin.
 *
 * Configuration lives under `catalog.providers.mozcloud` — see config.d.ts.
 */
export const catalogModuleMozcloud = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'mozcloud',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, scheduler }) {
        const root = config.getOptionalConfig('catalog.providers.mozcloud');
        if (!root) {
          logger.info(
            'mozcloud provider not configured (catalog.providers.mozcloud); skipping',
          );
          return;
        }

        const tenantsCfg = root.getOptionalConfig('tenants');
        if (tenantsCfg) {
          const schedule = tenantsCfg.has('schedule')
            ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
                tenantsCfg.getConfig('schedule'),
              )
            : {
                frequency: { minutes: 30 },
                timeout: { minutes: 5 },
                initialDelay: { seconds: 30 },
              };
          const source = createSource(
            {
              bigquery: tenantsCfg.getOptional('bigquery'),
              path: tenantsCfg.getOptionalString('path'),
            },
            logger,
          );
          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          const provider = new MozcloudTenantEntityProvider(
            source,
            logger,
            taskRunner,
          );
          catalog.addEntityProvider(provider);
          logger.info(
            `Registered mozcloud tenant provider (source: ${source.description})`,
          );
        }

        const wgCfg = root.getOptionalConfig('workgroups');
        if (wgCfg) {
          const schedule = wgCfg.has('schedule')
            ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
                wgCfg.getConfig('schedule'),
              )
            : { frequency: { minutes: 30 }, timeout: { minutes: 5 } };
          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          catalog.addEntityProvider(
            new MozcloudWorkgroupEntityProvider(logger, taskRunner),
          );
        }
      },
    });
  },
});

export default catalogModuleMozcloud;
