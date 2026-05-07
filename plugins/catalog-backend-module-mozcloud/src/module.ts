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
import { PathSource } from './sources/PathSource';
import { WorkgroupBigQuerySource } from './sources/WorkgroupBigQuerySource';
import { Source } from './sources/Source';
import {
  TenantRowSchema,
  WorkgroupRow,
  WorkgroupRowSchema,
} from './transform/schema';

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
          // Workgroup BigQuery is a JOIN of two tables (the nested
          // wstuckey_workgroups + the flat wstuckey_subgroup_members),
          // so it doesn't fit the generic createSource() shape — handle
          // it explicitly. Path mode still goes through PathSource.
          const wgBq = wgCfg.getOptional<{
            project: string;
            dataset: string;
            workgroupsTable?: string;
            subgroupMembersTable?: string;
          }>('bigquery');
          const wgPath = wgCfg.getOptionalString('path');
          if (wgBq && wgPath) {
            throw new Error(
              'mozcloud workgroups source must specify exactly one of `bigquery` or `path`',
            );
          }
          let source: Source<WorkgroupRow>;
          if (wgBq) {
            source = new WorkgroupBigQuerySource(wgBq, logger);
          } else if (wgPath) {
            source = new PathSource(wgPath, WorkgroupRowSchema, logger);
          } else {
            throw new Error(
              'mozcloud workgroups source requires either `bigquery` or `path` to be set',
            );
          }
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
