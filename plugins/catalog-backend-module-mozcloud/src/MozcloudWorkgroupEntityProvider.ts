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
import { WorkgroupRow } from './transform/schema';

/**
 * Catalog entity provider for Mozilla workgroups. Reads YAML rows from a
 * {@link Source} (filesystem today; the eventual `mozdata.mozcloud.workgroups`
 * BigQuery table tomorrow), runs them through {@link workgroupToEntities},
 * and applies a single full mutation per refresh.
 *
 * Group entities live in the `workgroups` namespace so they don't collide
 * with the GitHub Org provider's Groups in `default`. User entities for
 * workgroup members also live in the `workgroups` namespace, deduplicated
 * by sanitized email; their `spec.memberOf` is the union of every subgroup
 * that lists them as a member.
 */
export class MozcloudWorkgroupEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(
    private readonly source: Source<WorkgroupRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
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
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const workgroups = await this.source.fetchAll();
    const locationRef = `mozcloud-workgroups:${this.source.description}`;
    const raw: Entity[] = [];

    for (const wg of workgroups) {
      raw.push(...workgroupToEntities(wg, locationRef));
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
      } entities from ${workgroups.length} workgroups`,
    );
  }
}

/**
 * Dedupe entities by `kind:namespace/name`, but for User entities union
 * the `spec.memberOf` lists across emissions. Subgroups produce the
 * memberOf relation indirectly via `spec.members` referencing the User,
 * but we also populate `spec.memberOf` on the User side so each User's
 * entity page lists its groups.
 */
function mergeEntities(entities: Entity[]): Entity[] {
  const out = new Map<string, Entity>();

  // First pass: group entities by ref.
  for (const e of entities) {
    const key = entityRef(e);
    if (!out.has(key)) {
      out.set(key, e);
      continue;
    }
    if (e.kind === 'User') {
      // Should not happen in practice — User entities are emitted from
      // dedup'd email lists per workgroup — but be defensive.
      continue;
    }
  }

  // Second pass: walk all subgroup Groups and accumulate memberOf on Users.
  const userMemberOf = new Map<string, Set<string>>();
  for (const e of entities) {
    if (e.kind !== 'Group') continue;
    const groupRef = entityRef(e);
    for (const m of (e.spec as { members?: string[] }).members ?? []) {
      const set = userMemberOf.get(m) ?? new Set<string>();
      set.add(groupRef.replace(/^group:/, ''));
      userMemberOf.set(m, set);
    }
  }

  for (const [userKey, memberOf] of userMemberOf) {
    const user = out.get(userKey);
    if (!user || user.kind !== 'User') continue;
    (user.spec as { memberOf?: string[] }).memberOf =
      Array.from(memberOf).sort();
  }

  return Array.from(out.values());
}

function entityRef(e: Entity): string {
  return `${e.kind.toLowerCase()}:${e.metadata.namespace ?? 'default'}/${
    e.metadata.name
  }`.toLowerCase();
}
