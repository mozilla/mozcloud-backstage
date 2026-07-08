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
import { workgroupToEntities } from './transform/workgroupToEntities';
import { emailLocalPart, subgroupName } from './transform/refs';
import {
  UserRow,
  UserRowSchema,
  WorkgroupRow,
  WorkgroupRowSchema,
} from './transform/schema';
import { defineBigQuerySource } from './sources/BigQuerySource';
import {
  usersQuery,
  usersSourceDescription,
  workgroupsQuery,
  workgroupsSourceDescription,
} from './queries';

const DEFAULT_SCHEDULE = {
  frequency: { minutes: 30 },
  timeout: { minutes: 5 },
  initialDelay: { seconds: 30 },
};

/**
 * Catalog entity provider for Mozilla workgroups.
 *
 * Reads from two sources:
 *  - `workgroups` source — one row per workgroup with nested subgroups.
 *    Drives Group entities (workgroup + subgroup), both in the
 *    `workgroups` namespace so they don't collide with the GitHub Org
 *    provider's Groups in `default`.
 *  - `users` source — one row per human user, with the `(workgroup,
 *    subgroup)` memberships they hold. Used only to back-fill each
 *    subgroup's `spec.members` with `user:people/<name>` refs.
 *    User entities themselves are emitted by MozcloudPeopleEntityProvider.
 */
export class MozcloudWorkgroupEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  readonly description: string;

  constructor(
    private readonly workgroupsSource: Source<WorkgroupRow>,
    private readonly usersSource: Source<UserRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
  ) {
    this.description = `workgroups: ${workgroupsSource.description}, users: ${usersSource.description}`;
  }

  getProviderName(): string {
    return 'MozcloudWorkgroupEntityProvider';
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
    this.logger.info(`Starting new refresh for ${this.getProviderName()}`);
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const [workgroups, users] = await Promise.all([
      this.workgroupsSource.fetchAll(),
      this.usersSource.fetchAll(),
    ]);

    const wgLocationRef = `mozcloud-workgroups:${this.workgroupsSource.description}`;
    const raw: Entity[] = [];
    for (const wg of workgroups) {
      raw.push(...workgroupToEntities(wg, wgLocationRef));
    }

    const deduped = dedupeByRef(raw);
    const groupMembers = buildGroupMembers(users);
    for (const e of deduped) {
      if (e.kind !== 'Group') continue;
      const members = groupMembers.get(entityRef(e));
      if (members) (e.spec as { members?: string[] }).members = members;
    }

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
      } entities from ${workgroups.length} workgroups and ${
        users.length
      } users`,
    );
  }

  /**
   * Build a provider from its `catalog.providers.mozcloud.workgroups`
   * config block.
   */
  static createFromConfig(
    config: Config,
    logger: LoggerService,
    scheduler: SchedulerService,
  ): MozcloudWorkgroupEntityProvider {
    const wgBq = config.getConfig('sources.workgroups.bigquery').get<{
      project: string;
      dataset: string;
      workgroupsTable?: string;
      billingProject?: string;
    }>();
    const workgroupsSource = defineBigQuerySource({
      query: workgroupsQuery(wgBq),
      schema: WorkgroupRowSchema,
      description: workgroupsSourceDescription(wgBq),
      billingProject: wgBq.billingProject,
      dataProject: wgBq.project,
      logger,
    });

    const usersCfg = config.getConfig('sources.users.bigquery');
    const usersBq = usersCfg.get<{
      project: string;
      dataset: string;
      subgroupMembersTable?: string;
      billingProject?: string;
    }>();
    const usersSource = defineBigQuerySource({
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

    return new MozcloudWorkgroupEntityProvider(
      workgroupsSource,
      usersSource,
      logger,
      taskRunner,
    );
  }
}

/**
 * Build `group:workgroups/<wg>-<sub>` -> sorted unique `user:people/<name>`
 * refs from the membership rows. The people users themselves are emitted by
 * MozcloudPeopleEntityProvider; here we only reference them so each subgroup
 * Group's `spec.members` resolves.
 */
export function buildGroupMembers(users: UserRow[]): Map<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const u of users) {
    const ref = `user:people/${emailLocalPart(u.email)}`;
    for (const m of u.memberships) {
      const key = `group:workgroups/${subgroupName(
        m.workgroup,
        m.subgroup,
      )}`.toLowerCase();
      const set = sets.get(key) ?? new Set<string>();
      set.add(ref);
      sets.set(key, set);
    }
  }
  const out = new Map<string, string[]>();
  for (const [key, set] of sets) out.set(key, Array.from(set).sort());
  return out;
}

/** Dedupe entities by `kind:namespace/name` (first wins). */
function dedupeByRef(entities: Entity[]): Entity[] {
  const out = new Map<string, Entity>();
  for (const e of entities) {
    const key = entityRef(e);
    if (!out.has(key)) out.set(key, e);
  }
  return Array.from(out.values());
}

function entityRef(e: Entity): string {
  return `${e.kind.toLowerCase()}:${e.metadata.namespace ?? 'default'}/${
    e.metadata.name
  }`.toLowerCase();
}
