import {
  coreServices,
  createBackendModule,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { MozcloudWorkgroupEntityProvider } from './MozcloudWorkgroupEntityProvider';
import {
  defineBigQuerySource,
  normalizeTenantRow,
} from './sources/BigQuerySource';
import {
  tenantsQuery,
  workgroupsQuery,
  workgroupsSourceDescription,
} from './queries';
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
 * Each provider requires a `bigquery` block; auth follows ADC.
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
          const tenantsBq = tenantsCfg.getConfig('bigquery').get<{
            project: string;
            dataset: string;
            table: string;
            billingProject?: string;
          }>();
          const schedule = tenantsCfg.has('schedule')
            ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
                tenantsCfg.getConfig('schedule'),
              )
            : DEFAULT_SCHEDULE;
          const source = defineBigQuerySource({
            query: tenantsQuery(tenantsBq),
            schema: TenantRowSchema,
            description: `bigquery:${tenantsBq.project}.${tenantsBq.dataset}.${tenantsBq.table}`,
            billingProject: tenantsBq.billingProject,
            dataProject: tenantsBq.project,
            normalize: normalizeTenantRow,
            logger,
          });
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
          const wgBq = wgCfg.getConfig('bigquery').get<{
            project: string;
            dataset: string;
            workgroupsTable?: string;
            subgroupMembersTable?: string;
            billingProject?: string;
          }>();
          const schedule = wgCfg.has('schedule')
            ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
                wgCfg.getConfig('schedule'),
              )
            : DEFAULT_SCHEDULE;
          const source = defineBigQuerySource({
            query: workgroupsQuery(wgBq),
            schema: WorkgroupRowSchema,
            description: workgroupsSourceDescription(wgBq),
            billingProject: wgBq.billingProject,
            dataProject: wgBq.project,
            logger,
          });
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
