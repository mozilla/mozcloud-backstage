import {
  coreServices,
  createBackendModule,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { MozcloudWorkgroupEntityProvider } from './MozcloudWorkgroupEntityProvider';
import { createSource } from './sources/createSource';
import { normalizeTenantRow } from './sources/BigQuerySource';
import { TenantRowSchema, WorkgroupRowSchema } from './transform/schema';

const DEFAULT_SCHEDULE = {
  frequency: { minutes: 30 },
  timeout: { minutes: 5 },
  initialDelay: { seconds: 30 },
};

/**
 * Backstage backend module that registers the mozcloud tenant and
 * workgroup catalog entity providers under the existing catalog plugin.
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
            : DEFAULT_SCHEDULE;
          const source = createSource(
            {
              bigquery: tenantsCfg.getOptional('bigquery'),
              path: tenantsCfg.getOptionalString('path'),
            },
            TenantRowSchema,
            logger,
            normalizeTenantRow,
          );
          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          catalog.addEntityProvider(
            new MozcloudTenantEntityProvider(source, logger, taskRunner),
          );
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
            : DEFAULT_SCHEDULE;
          const source = createSource(
            {
              bigquery: wgCfg.getOptional('bigquery'),
              path: wgCfg.getOptionalString('path'),
            },
            WorkgroupRowSchema,
            logger,
          );
          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          catalog.addEntityProvider(
            new MozcloudWorkgroupEntityProvider(source, logger, taskRunner),
          );
          logger.info(
            `Registered mozcloud workgroup provider (source: ${source.description})`,
          );
        }
      },
    });
  },
});

export default catalogModuleMozcloud;
