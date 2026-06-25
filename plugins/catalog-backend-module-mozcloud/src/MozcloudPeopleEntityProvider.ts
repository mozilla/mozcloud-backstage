import {
  LoggerService,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { Entity } from '@backstage/catalog-model';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Source } from './sources/Source';
import { defineBigQuerySource } from './sources/BigQuerySource';
import { personToEntity } from './transform/personToEntity';
import { UserRow, UserRowSchema } from './transform/schema';
import { usersQuery, usersSourceDescription } from './queries';

const DEFAULT_SCHEDULE = {
  frequency: { hours: 6 },
  timeout: { minutes: 10 },
  initialDelay: { seconds: 30 },
};

/**
 * Catalog entity provider that produces Backstage `User` entities in the
 * `people` namespace, sourced directly from the BigQuery users table
 * (workgroup_subgroup_members, member_type='user').
 *
 * One entity per distinct email, deduped by ref, pushed as a single full
 * mutation per refresh.
 */
export class MozcloudPeopleEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  readonly description: string;

  constructor(
    private readonly usersSource: Source<UserRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.description = `people: ${usersSource.description}`;
  }

  getProviderName(): string {
    return 'MozcloudPeopleEntityProvider';
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

    const rows = await this.usersSource.fetchAll();
    const locationRef = `mozcloud-people:${this.usersSource.description}`;
    const seen = new Set<string>();
    const entities: Entity[] = [];

    for (const row of rows) {
      const entity = personToEntity(row, locationRef);
      const ref = `${entity.metadata.namespace}/${entity.metadata.name}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      entities.push(entity);
    }

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({
        entity,
        locationKey: this.getProviderName(),
      })),
    });

    this.logger.info(
      `${this.getProviderName()}: applied full mutation with ${
        entities.length
      } users from ${rows.length} rows`,
    );
  }

  static createFromConfig(
    config: Config,
    logger: LoggerService,
    scheduler: SchedulerService,
  ): MozcloudPeopleEntityProvider {
    const usersBq = config.getConfig('bigqueryUsers').get<{
      project: string;
      dataset: string;
      subgroupMembersTable?: string;
      billingProject?: string;
    }>();

    const usersSource = defineBigQuerySource<UserRow>({
      query: usersQuery(usersBq),
      schema: UserRowSchema,
      description: usersSourceDescription(usersBq),
      billingProject: usersBq.billingProject,
      dataProject: usersBq.project,
      logger,
    });

    const schedule = config.has('schedule')
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
          config.getConfig('schedule'),
        )
      : DEFAULT_SCHEDULE;
    const taskRunner = scheduler.createScheduledTaskRunner(schedule);

    return new MozcloudPeopleEntityProvider(usersSource, logger, taskRunner);
  }
}
