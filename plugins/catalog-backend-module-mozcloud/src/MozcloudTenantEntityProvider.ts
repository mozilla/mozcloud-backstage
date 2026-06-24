import {
  LoggerService,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerService,
  SchedulerServiceTaskRunner,
  UrlReaderService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { Entity } from '@backstage/catalog-model';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Source } from './sources/Source';
import { tenantToEntities } from './transform/tenantToEntities';
import { chartToEntities } from './transform/chartToEntities';
import {
  ChartDeploymentsRow,
  ChartDeploymentsRowSchema,
  TenantRow,
  TenantRowSchema,
} from './transform/schema';
import {
  defineBigQuerySource,
  normalizeTenantRow,
} from './sources/BigQuerySource';
import {
  chartsDeploymentsQuery,
  chartsDeploymentsSourceDescription,
  tenantsQuery,
} from './queries';
import { tenantOwner } from './transform/refs';
import { parseOverlay } from './overlay/parseOverlay';
import { mergeOverlayEntities, TenantScope } from './overlay/mergeOverlay';
import {
  fetchTenantOverlay,
  readOverlayConfig,
  OverlayConfig,
} from './overlay/fetchTenantOverlay';

const DEFAULT_SCHEDULE = {
  frequency: { minutes: 30 },
  timeout: { minutes: 5 },
  initialDelay: { seconds: 30 },
};

/**
 * Catalog entity provider that turns rows from a {@link Source} (BigQuery
 * or filesystem) into Backstage entities and pushes them as a single full
 * mutation per refresh. Full mutations let the catalog engine handle
 * deletes automatically — a tenant removed upstream disappears on the
 * next tick.
 *
 * The tenants source produces Domain / System / Resource entities via
 * {@link tenantToEntities}. The {@link ChartDeploymentsRow} source
 * produces the helm chart Components and helm-deployment sub-Components
 * via {@link chartToEntities}; each row carries the tenant metadata it
 * needs so the transform is row-local.
 */
export class MozcloudTenantEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  readonly description: string;

  constructor(
    private readonly tenantsSource: Source<TenantRow>,
    private readonly chartsSource: Source<ChartDeploymentsRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
    private readonly reader?: UrlReaderService,
    private readonly overlay?: OverlayConfig,
  ) {
    this.description = `tenants: ${tenantsSource.description}, charts: ${chartsSource.description}`;
  }

  getProviderName(): string {
    return 'MozcloudTenantEntityProvider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.taskRunner.run({
      id: `${this.getProviderName()}:refresh`,
      fn: async () => {
        try {
          await this.refresh();
        } catch (error) {
          this.logger.error(
            `${this.getProviderName()} refresh failed: ${
              (error as Error).message
            }`,
          );
        }
      },
    });
  }

  private async refresh(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const [tenants, charts] = await Promise.all([
      this.tenantsSource.fetchAll(),
      this.chartsSource.fetchAll(),
    ]);

    const tenantsLocationRef = `mozcloud:${this.tenantsSource.description}`;
    const chartsLocationRef = `mozcloud:${this.chartsSource.description}`;
    const entities: Entity[] = [];

    for (const tenant of tenants) {
      entities.push(...tenantToEntities(tenant, tenantsLocationRef));
    }

    for (const chart of charts) {
      entities.push(...chartToEntities(chart, chartsLocationRef));
    }

    let merged = entities;
    if (this.overlay?.enabled && this.reader) {
      merged = await this.applyOverlays(merged, tenants);
    }

    const deduped = dedupeByEntityRef(merged);

    await this.connection.applyMutation({
      type: 'full',
      entities: deduped.map(entity => ({
        entity,
        locationKey: this.getProviderName(),
      })),
    });

    this.logger.info(
      `${this.getProviderName()}: applied full mutation with ${
        deduped.length
      } entities from ${tenants.length} tenants and ${
        charts.length
      } chart rows`,
    );
  }

  /**
   * Fetch and merge each tenant's overlay file into the generated entity
   * set. Per-tenant isolation: a failed fetch/parse/merge for one tenant
   * is logged and skipped — it never aborts the refresh or drops the
   * BigQuery-generated entities.
   */
  private async applyOverlays(
    entities: Entity[],
    tenants: TenantRow[],
  ): Promise<Entity[]> {
    if (!this.overlay || !this.reader) return entities;
    let merged = entities;
    for (const tenant of tenants) {
      const appCode = tenant.globals.app_code;
      const fn = tenant.globals.function;
      const scope: TenantScope = {
        appCode,
        owner: tenantOwner(tenant.globals.workgroups),
      };
      try {
        const content = await fetchTenantOverlay(
          this.reader,
          this.overlay,
          { function: fn, app_code: appCode },
          this.logger,
        );
        if (!content) continue;
        const overlayEntities = parseOverlay(content, {
          description: `overlay:${appCode}`,
          logger: this.logger,
        });
        if (overlayEntities.length === 0) continue;
        merged = mergeOverlayEntities(
          merged,
          overlayEntities,
          scope,
          this.logger,
        );
        this.logger.info(
          `${this.getProviderName()}: applied overlay for ${appCode} (${
            overlayEntities.length
          } docs)`,
        );
      } catch (error) {
        this.logger.warn(
          `${this.getProviderName()}: overlay for ${appCode} failed: ${
            (error as Error).message
          }`,
        );
      }
    }
    return merged;
  }

  /**
   * Build a provider from its `catalog.providers.mozcloud.tenants` config
   * block. Owns the wiring of both BigQuery sources, the task schedule,
   * and the task runner so the registering module just hands the block
   * over and registers the result.
   */
  static createFromConfig(
    config: Config,
    logger: LoggerService,
    reader: UrlReaderService,
    scheduler: SchedulerService,
  ): MozcloudTenantEntityProvider {
    const tenantsBq = config.getConfig('sources.tenants.bigquery').get<{
      project: string;
      dataset: string;
      table: string;
      billingProject?: string;
    }>();
    const tenantsSource = defineBigQuerySource({
      query: tenantsQuery(tenantsBq),
      schema: TenantRowSchema,
      description: `bigquery:${tenantsBq.project}.${tenantsBq.dataset}.${tenantsBq.table}`,
      billingProject: tenantsBq.billingProject,
      dataProject: tenantsBq.project,
      normalize: normalizeTenantRow,
      logger,
    });

    const chartsBq = config.getConfig('sources.charts.bigquery').get<{
      project: string;
      dataset: string;
      tenantsTable?: string;
      deployedChartsTable?: string;
      billingProject?: string;
    }>();
    const chartsSource = defineBigQuerySource({
      query: chartsDeploymentsQuery(chartsBq),
      schema: ChartDeploymentsRowSchema,
      description: chartsDeploymentsSourceDescription(chartsBq),
      billingProject: chartsBq.billingProject,
      dataProject: chartsBq.project,
      logger,
    });

    const schedule = config.has('schedule')
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
          config.getConfig('schedule'),
        )
      : DEFAULT_SCHEDULE;
    const taskRunner = scheduler.createScheduledTaskRunner(schedule);

    const overlay = readOverlayConfig(config);

    return new MozcloudTenantEntityProvider(
      tenantsSource,
      chartsSource,
      logger,
      taskRunner,
      reader,
      overlay,
    );
  }
}

/**
 * Dedupe entities by `kind:namespace/name`. Group shells in particular
 * collide a lot — many tenants reference the same workgroup, and each
 * tenant's transform emits a Group shell for it.
 */
function dedupeByEntityRef(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const e of entities) {
    const ref = `${e.kind.toLowerCase()}:${e.metadata.namespace ?? 'default'}/${
      e.metadata.name
    }`.toLowerCase();
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(e);
  }
  return out;
}
