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
import { defineBigQuerySource } from './sources/BigQuerySource';
import { GithubEnrichment, personToEntity } from './transform/personToEntity';
import {
  PersonRosterRow,
  PersonRosterRowSchema,
  UserRow,
  UserRowSchema,
} from './transform/schema';
import { usersQuery, usersSourceDescription } from './queries';

const DEFAULT_SCHEDULE = {
  frequency: { hours: 6 },
  timeout: { minutes: 10 },
  initialDelay: { seconds: 30 },
};

/** CIS endpoint for active LDAP (staff) roster, paginated by nextPage. */
const STAFF_LIST_PATH = '/users/id/all?connectionMethod=ad';

/**
 * Catalog entity provider that produces Backstage `User` entities in the
 * `people` namespace from the CIS Person API staff roster, enriched with
 * GitHub identity and display name from BigQuery.
 *
 * One entity per roster row, deduped by ref, pushed as a single full
 * mutation per refresh.
 */
export class MozcloudPeopleEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  readonly description: string;

  constructor(
    private readonly rosterSource: Source<PersonRosterRow>,
    private readonly usersSource: Source<UserRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.description = `people: ${rosterSource.description}`;
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

    const [rosterRows, userRows] = await Promise.all([
      this.rosterSource.fetchAll(),
      this.usersSource.fetchAll(),
    ]);

    // Build lookup map keyed by lowercase email
    const usersByEmail = new Map<string, UserRow>();
    for (const u of userRows) {
      usersByEmail.set(u.email.toLowerCase(), u);
    }

    const locationRef = `mozcloud-people:${this.rosterSource.description}`;
    const seen = new Set<string>();
    const entities: Entity[] = [];

    for (const row of rosterRows) {
      const bqUser = usersByEmail.get(row.primary_email.toLowerCase());
      const enrichment: GithubEnrichment | undefined = bqUser
        ? {
            name: bqUser.name,
            githubLogin: bqUser.github_login,
            githubNodeId: bqUser.github_node_id,
            githubOrgs: bqUser.github_orgs,
          }
        : undefined;

      const entity = personToEntity(row, enrichment, locationRef);
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
      } users from ${rosterRows.length} roster rows`,
    );
  }

  static createFromConfig(
    config: Config,
    logger: LoggerService,
    scheduler: SchedulerService,
  ): MozcloudPeopleEntityProvider {
    const authCfg = config.getConfig('auth');
    const apiBaseUrl = config.getString('apiBaseUrl').replace(/\/$/, '');

    const rosterSource = definePersonApiSource<PersonRosterRow>({
      auth: {
        tokenUrl: authCfg.getString('tokenUrl'),
        audience: authCfg.getString('audience'),
        clientId: authCfg.getString('clientId'),
        clientSecret: authCfg.getString('clientSecret'),
        scope: authCfg.getOptionalString('scope'),
      },
      apiBaseUrl,
      listPath: STAFF_LIST_PATH,
      schema: PersonRosterRowSchema,
      unwrap: r => r,
      description: `person-api:${apiBaseUrl}`,
      logger,
    });

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

    return new MozcloudPeopleEntityProvider(
      rosterSource,
      usersSource,
      logger,
      taskRunner,
    );
  }
}
