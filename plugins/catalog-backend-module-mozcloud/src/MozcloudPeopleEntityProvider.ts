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
import { definePersonApiSource } from './sources/PersonApiSource';
import { personToEntity, unwrapCisProfile } from './transform/personToEntity';
import { PersonProfileRow, PersonProfileRowSchema } from './transform/schema';

const DEFAULT_SCHEDULE = {
  frequency: { hours: 6 },
  timeout: { minutes: 10 },
  initialDelay: { seconds: 30 },
};

/** CIS endpoint for active staff full profiles, paginated by nextPage. */
const STAFF_LIST_PATH =
  '/users/id/all/by_attribute_contains?staff_information.staff=True&fullProfiles=True&active=True';

/**
 * Catalog entity provider that turns CIS Person API staff profiles into
 * Backstage `User` entities in the `people` namespace, pushed as a single
 * full mutation per refresh.
 */
export class MozcloudPeopleEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  readonly description: string;

  constructor(
    private readonly source: Source<PersonProfileRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.description = `people: ${source.description}`;
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
    const rows = await this.source.fetchAll();
    const locationRef = `mozcloud-people:${this.source.description}`;

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
      } users from ${rows.length} profiles`,
    );
  }

  static createFromConfig(
    config: Config,
    logger: LoggerService,
    scheduler: SchedulerService,
  ): MozcloudPeopleEntityProvider {
    const authCfg = config.getConfig('auth');
    const apiBaseUrl = config.getString('apiBaseUrl').replace(/\/$/, '');
    const source = definePersonApiSource<PersonProfileRow>({
      auth: {
        tokenUrl: authCfg.getString('tokenUrl'),
        audience: authCfg.getString('audience'),
        clientId: authCfg.getString('clientId'),
        clientSecret: authCfg.getString('clientSecret'),
        scope: authCfg.getOptionalString('scope'),
      },
      apiBaseUrl,
      listPath: STAFF_LIST_PATH,
      schema: PersonProfileRowSchema,
      unwrap: unwrapCisProfile,
      description: `person-api:${apiBaseUrl}`,
      logger,
    });

    const schedule = config.has('schedule')
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
          config.getConfig('schedule'),
        )
      : DEFAULT_SCHEDULE;
    const taskRunner = scheduler.createScheduledTaskRunner(schedule);

    return new MozcloudPeopleEntityProvider(source, logger, taskRunner);
  }
}
