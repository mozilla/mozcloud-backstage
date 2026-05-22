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
import { workgroupToEntities } from './transform/workgroupToEntities';
import { userToEntities } from './transform/userToEntities';
import { UserRow, WorkgroupRow } from './transform/schema';

/**
 * Catalog entity provider for Mozilla workgroups.
 *
 * Reads from two sources:
 *  - `workgroups` source — one row per workgroup with nested subgroups.
 *    Drives Group entities (workgroup + subgroup), both in the
 *    `workgroups` namespace so they don't collide with the GitHub Org
 *    provider's Groups in `default`.
 *  - optional `users` source — one row per human user, with GitHub
 *    metadata and the `(workgroup, subgroup)` memberships they hold.
 *    Drives User entities in the `workgroups` namespace and back-fills
 *    each subgroup's `spec.members` so Group pages list humans.
 *
 * Without a users source the provider still emits Groups; subgroup
 * `spec.members` stays empty and no User entities are produced.
 */
export class MozcloudWorkgroupEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(
    private readonly source: Source<WorkgroupRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
    private readonly usersSource?: Source<UserRow>,
  ) {}

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
    this.logger.info(`Starting new refresh for ${this.getProviderName()}`)
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const [workgroups, users] = await Promise.all([
      this.source.fetchAll(),
      this.usersSource ? this.usersSource.fetchAll() : Promise.resolve([]),
    ]);

    const wgLocationRef = `mozcloud-workgroups:${this.source.description}`;
    const userLocationRef = this.usersSource
      ? `mozcloud-users:${this.usersSource.description}`
      : wgLocationRef;
    const raw: Entity[] = [];

    for (const wg of workgroups) {
      raw.push(...workgroupToEntities(wg, wgLocationRef));
    }
    for (const u of users) {
      raw.push(...userToEntities(u, userLocationRef));
    }

    const merged = mergeEntities(raw);

    await this.connection.applyMutation({
      type: 'full',
      entities: merged.map(entity => ({
        entity,
        locationKey: this.getProviderName(),
      })),
    });

    this.logger.info(
      `${this.getProviderName()}: applied full mutation with ${
        merged.length
      } entities from ${workgroups.length} workgroups${
        this.usersSource ? ` and ${users.length} users` : ''
      }`,
    );
  }
}

/**
 * Dedupe entities by `kind:namespace/name`, then back-fill each subgroup
 * Group's `spec.members` from the User entities' `spec.memberOf`.
 *
 * Source of truth for membership is the User side — User.spec.memberOf is
 * populated by `userToEntities` from the user row's `memberships[]`. We
 * walk those refs to build a reverse map (group -> user refs) and write
 * the resulting `members` array back onto each Group so the catalog UI
 * shows membership on both sides.
 */
function mergeEntities(entities: Entity[]): Entity[] {
  const out = new Map<string, Entity>();

  for (const e of entities) {
    const key = entityRef(e);
    if (!out.has(key)) {
      out.set(key, e);
    }
  }

  const groupMembers = new Map<string, Set<string>>();
  for (const e of out.values()) {
    if (e.kind !== 'User') continue;
    const userRef = entityRef(e);
    for (const groupShortRef of (e.spec as { memberOf?: string[] }).memberOf ??
      []) {
      const groupKey = `group:${groupShortRef}`.toLowerCase();
      const set = groupMembers.get(groupKey) ?? new Set<string>();
      set.add(userRef);
      groupMembers.set(groupKey, set);
    }
  }

  for (const [groupKey, members] of groupMembers) {
    const group = out.get(groupKey);
    if (!group || group.kind !== 'Group') continue;
    (group.spec as { members?: string[] }).members = Array.from(members).sort();
  }

  return Array.from(out.values());
}

function entityRef(e: Entity): string {
  return `${e.kind.toLowerCase()}:${e.metadata.namespace ?? 'default'}/${
    e.metadata.name
  }`.toLowerCase();
}
