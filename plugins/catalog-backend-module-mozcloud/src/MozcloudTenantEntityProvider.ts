import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Source } from './sources/Source';
import { tenantToEntities } from './transform/tenantToEntities';
import { chartToEntities } from './transform/chartToEntities';
import { ChartDeploymentsRow, TenantRow } from './transform/schema';

/**
 * Catalog entity provider that turns rows from a {@link Source} (BigQuery
 * or filesystem) into Backstage entities and pushes them as a single full
 * mutation per refresh. Full mutations let the catalog engine handle
 * deletes automatically — a tenant removed upstream disappears on the
 * next tick.
 *
 * The tenants source produces Domain / System / Resource entities via
 * {@link tenantToEntities}. The optional {@link ChartDeploymentsRow}
 * source produces the helm chart Components and helm-deployment
 * sub-Components via {@link chartToEntities}; each row carries the
 * tenant metadata it needs so the transform is row-local.
 */
export class MozcloudTenantEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(
    private readonly source: Source<TenantRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
    private readonly chartsSource?: Source<ChartDeploymentsRow>,
  ) {}

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
      this.source.fetchAll(),
      this.chartsSource ? this.chartsSource.fetchAll() : Promise.resolve([]),
    ]);

    const tenantsLocationRef = `mozcloud:${this.source.description}`;
    const chartsLocationRef = this.chartsSource
      ? `mozcloud:${this.chartsSource.description}`
      : tenantsLocationRef;
    const entities: Entity[] = [];

    for (const tenant of tenants) {
      entities.push(...tenantToEntities(tenant, tenantsLocationRef));
    }

    for (const chart of charts) {
      entities.push(...chartToEntities(chart, chartsLocationRef));
    }

    const deduped = dedupeByEntityRef(entities);

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
      } entities from ${tenants.length} tenants${
        this.chartsSource ? ` (charts source: ${charts.length} rows)` : ''
      }`,
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
