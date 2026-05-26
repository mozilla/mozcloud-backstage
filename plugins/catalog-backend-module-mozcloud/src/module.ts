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
  chartsDeploymentsQuery,
  chartsDeploymentsSourceDescription,
  tenantsQuery,
  usersQuery,
  usersSourceDescription,
  workgroupsQuery,
  workgroupsSourceDescription,
} from './queries';
import {
  ChartDeploymentsRowSchema,
  TenantRowSchema,
  UserRowSchema,
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
            dataProject: tenantsBq.project,
            normalize: normalizeTenantRow,
            logger,
          });

          // Optional second source: actual deployment tree per chart.
          // The tenant provider correlates rows by (tenant, chart_name)
          // and enriches the corresponding chart Components.
          const chartsCfg = root.getOptionalConfig('charts');
          let chartsSource;
          if (chartsCfg) {
            const chartsBq = chartsCfg.getConfig('bigquery').get<{
              project: string;
              dataset: string;
              tenantsTable?: string;
              deployedChartsTable?: string;
            }>();
            chartsSource = defineBigQuerySource({
              query: chartsDeploymentsQuery(chartsBq),
              schema: ChartDeploymentsRowSchema,
              description: chartsDeploymentsSourceDescription(chartsBq),
              dataProject: chartsBq.project,
              logger,
            });
          }

          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          catalog.addEntityProvider(
            new MozcloudTenantEntityProvider(
              source,
              logger,
              taskRunner,
              chartsSource,
            ),
          );
          logger.info(
            `Registered mozcloud tenant provider (tenants: ${
              source.description
            }${chartsSource ? `, charts: ${chartsSource.description}` : ''})`,
          );
        }

        const wgCfg = root.getOptionalConfig('workgroups');
        if (wgCfg) {
          const wgBq = wgCfg.getConfig('bigquery').get<{
            project: string;
            dataset: string;
            workgroupsTable?: string;
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
            dataProject: wgBq.project,
            logger,
          });

          // Optional second source: human users with GitHub identity and
          // per-user (workgroup, subgroup) memberships. Drives User
          // entity emission and back-fills subgroup Group members.
          const usersCfg = root.getOptionalConfig('users');
          let usersSource;
          if (usersCfg) {
            const usersBq = usersCfg.getConfig('bigquery').get<{
              project: string;
              dataset: string;
              subgroupMembersTable?: string;
            }>();
            usersSource = defineBigQuerySource({
              query: usersQuery(usersBq),
              schema: UserRowSchema,
              description: usersSourceDescription(usersBq),
              dataProject: usersBq.project,
              logger,
            });
          }

          const taskRunner = scheduler.createScheduledTaskRunner(schedule);
          catalog.addEntityProvider(
            new MozcloudWorkgroupEntityProvider(
              source,
              logger,
              taskRunner,
              usersSource,
            ),
          );
          logger.info(
            `Registered mozcloud workgroup provider (workgroups: ${
              source.description
            }${usersSource ? `, users: ${usersSource.description}` : ''})`,
          );
        }
      },
    });
  },
});

export default catalogModuleMozcloud;
