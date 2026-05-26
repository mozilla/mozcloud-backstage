import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  CatalogApi,
  catalogApiRef,
  entityPresentationSnapshot,
  getEntityRelations,
  useEntity,
} from '@backstage/plugin-catalog-react';
import {
  Entity,
  RELATION_CHILD_OF,
  RELATION_MEMBER_OF,
  RELATION_PARENT_OF,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  Skeleton,
  Text,
} from '@backstage/ui';
import { useMemo } from 'react';
import useAsync from 'react-use/lib/useAsync';

interface Props {
  entityFilterKind?: string[];
  entityLimit?: number;
}

interface Counter {
  kind: string;
  type?: string;
  count: number;
  query: string;
}

/**
 * Override for `entity-card:org/ownership`.
 *
 * The stock org plugin walks ownership ONE hop for users: it queries
 * entities owned by `[user, ...user.memberOf]`. In our workgroup model
 * users belong to subgroups (e.g. `fxa-developers`) and ownership is
 * usually assigned to the parent workgroup (`fxa`), so the stock walker
 * misses everything owned by the parent.
 *
 * This override:
 *   - For Users: walks UP each direct group's ancestors via
 *     `RELATION_CHILD_OF` so parent-workgroup ownership shows up on a
 *     user's profile page.
 *   - For parent Group (`spec.type: workgroup`): walks DOWN via
 *     `RELATION_PARENT_OF` collecting subgroup descendants. Mirrors the
 *     stock org plugin's group-aggregation behavior.
 *   - For subgroup Group (`spec.type: workgroup-subgroup`): walks UP
 *     via `RELATION_CHILD_OF` to include the parent workgroup as an
 *     owner, so the Ownership card on `fxa-developers` surfaces things
 *     owned by `fxa` itself.
 */
export const WorkgroupOwnershipCard = (props: Props) => {
  const { entity } = useEntity();
  const catalogApi = useApi(catalogApiRef);
  const catalogLink = useRouteRef(catalogPlugin.routes.catalogIndex);

  // Users and subgroups walk OUT to surface anything owned by their
  // groups / parent workgroup. Parent workgroups stay direct since they
  // typically own things in their own right. The toggle is intentionally
  // gone — direct mode on a subgroup almost always renders empty and was
  // more confusing than useful.
  const isSubgroup =
    entity.kind === 'Group' &&
    (entity.spec as { type?: string } | undefined)?.type ===
      'workgroup-subgroup';
  const kinds = useMemo(
    () => props.entityFilterKind ?? ['Component', 'API', 'System', 'Resource'],
    [props.entityFilterKind],
  );
  const entityLimit = props.entityLimit ?? 6;

  const {
    loading,
    error,
    value: counters,
  } = useAsync(async () => {
    const owners = await getOwners(entity, catalogApi);
    if (owners.length === 0) return [];
    const owned = await batchGetOwnedEntitiesByOwners(
      owners,
      kinds,
      catalogApi,
    );
    return reduceToCounters(owned, owners, entityLimit);
  }, [catalogApi, entity, kinds, entityLimit]);

  return (
    <Card>
      <CardHeader>
        <Text variant="title-medium" weight="bold">
          Ownership
        </Text>
      </CardHeader>
      <CardBody>
        {loading && <Skeleton />}
        {error && (
          <Alert
            status="danger"
            title="Failed to load ownership"
            description={error.message}
          />
        )}
        {!loading && !error && (!counters || counters.length === 0) && (
          <Text color="secondary">Nothing owned.</Text>
        )}
        {counters && counters.length > 0 && (
          <Grid.Root columns={{ initial: '2', md: '3' }} gap="3">
            {counters.map(c => {
              const url = catalogLink
                ? `${catalogLink()}?${c.query}`
                : undefined;
              const label = `Browse ${c.kind.toLowerCase()} owned by this entity`;
              const body = (
                <Flex direction="column" align="center" gap="1">
                  <Text variant="title-large" weight="bold">
                    {c.count}
                  </Text>
                  <Text variant="body-small" weight="bold">
                    {(c.type ?? c.kind).toUpperCase()}
                  </Text>
                  {c.type && (
                    <Text variant="body-x-small" color="secondary">
                      {c.kind}
                    </Text>
                  )}
                </Flex>
              );
              return url ? (
                <Card
                  key={`${c.kind}:${c.type ?? ''}`}
                  href={url}
                  label={label}
                >
                  {body}
                </Card>
              ) : (
                <Card key={`${c.kind}:${c.type ?? ''}`}>{body}</Card>
              );
            })}
          </Grid.Root>
        )}
      </CardBody>
    </Card>
  );
};

async function getOwners(
  entity: Entity,
  catalogApi: CatalogApi,
): Promise<string[]> {
  const type = (entity.spec as { type?: string } | undefined)?.type;
  if (entity.kind === 'User') {
    return getUserOwnersWithAncestors(entity, catalogApi);
  }
  if (entity.kind === 'Group' && type === 'workgroup-subgroup') {
    return getGroupAncestorRefs(entity, catalogApi);
  }
  return [stringifyEntityRef(entity)];
}

/**
 * User aggregated mode: include the user, their direct memberOf groups,
 * and every ancestor of those groups (walked via `RELATION_CHILD_OF`).
 *
 * One BFS level past the direct groups is enough for the workgroup
 * hierarchy we have today (subgroup -> workgroup); the recursive walk
 * below handles arbitrary depth just in case.
 */
async function getUserOwnersWithAncestors(
  user: Entity,
  catalogApi: CatalogApi,
): Promise<string[]> {
  const directGroups = getEntityRelations(user, RELATION_MEMBER_OF, {
    kind: 'Group',
  }).map(r => stringifyEntityRef(r));

  const owners = new Set<string>([stringifyEntityRef(user), ...directGroups]);
  const frontier = [...directGroups];
  const visited = new Set<string>(frontier);

  while (frontier.length > 0) {
    const batch = frontier.splice(0, frontier.length);
    const { items } = await catalogApi.getEntitiesByRefs({
      fields: ['kind', 'metadata.namespace', 'metadata.name', 'relations'],
      entityRefs: batch,
    });
    for (const group of items) {
      if (!group) continue;
      const ancestors = getEntityRelations(group, RELATION_CHILD_OF, {
        kind: 'Group',
      }).map(r => stringifyEntityRef(r));
      for (const a of ancestors) {
        if (visited.has(a)) continue;
        visited.add(a);
        owners.add(a);
        frontier.push(a);
      }
    }
  }

  return [...owners];
}

/**
 * Subgroup aggregated mode: walk UP via `RELATION_CHILD_OF` collecting
 * the subgroup itself plus every ancestor. Lets things owned by the
 * parent workgroup surface on a subgroup's Ownership card.
 */
async function getGroupAncestorRefs(
  group: Entity,
  catalogApi: CatalogApi,
): Promise<string[]> {
  const owners = new Set<string>([stringifyEntityRef(group)]);
  const frontier = [stringifyEntityRef(group)];

  while (frontier.length > 0) {
    const batch = frontier.splice(0, frontier.length);
    const { items } = await catalogApi.getEntitiesByRefs({
      fields: ['kind', 'metadata.namespace', 'metadata.name', 'relations'],
      entityRefs: batch,
    });
    for (const g of items) {
      if (!g) continue;
      const parents = getEntityRelations(g, RELATION_CHILD_OF, {
        kind: 'Group',
      }).map(r => stringifyEntityRef(r));
      for (const p of parents) {
        if (owners.has(p)) continue;
        owners.add(p);
        frontier.push(p);
      }
    }
  }

  return [...owners];
}

async function batchGetOwnedEntitiesByOwners(
  owners: string[],
  kinds: string[],
  catalogApi: CatalogApi,
  batchSize = 100,
): Promise<Entity[]> {
  const results: Entity[] = [];
  for (let i = 0; i < owners.length; i += batchSize) {
    const batch = owners.slice(i, i + batchSize);
    const response = await catalogApi.getEntities({
      filter: [{ kind: kinds, 'relations.ownedBy': batch }],
      fields: [
        'kind',
        'metadata.name',
        'metadata.namespace',
        'spec.type',
        'relations',
      ],
    });
    results.push(...response.items);
  }
  return dedupeByRef(results);
}

function dedupeByRef(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const e of entities) {
    const ref = stringifyEntityRef(e);
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(e);
  }
  return out;
}

function reduceToCounters(
  entities: Entity[],
  owners: string[],
  limit: number,
): Counter[] {
  const ownerNames = owners.map(
    ref =>
      entityPresentationSnapshot(ref, { defaultKind: 'group' }).primaryTitle,
  );
  const counts: Counter[] = [];
  for (const e of entities) {
    const type = (e.spec as { type?: string } | undefined)?.type;
    const match = counts.find(c => c.kind === e.kind && c.type === type);
    if (match) {
      match.count += 1;
    } else {
      counts.push({
        kind: e.kind,
        type,
        count: 1,
        query: buildCatalogQuery(e.kind, type, ownerNames),
      });
    }
  }
  return counts.sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Build the query string the catalog index page expects to pre-filter
 * by kind, type, and owners. Owners are display-name based (matches the
 * `EntityOwnerPicker` shape) — the catalog plugin resolves them back to
 * entity refs internally.
 */
function buildCatalogQuery(
  kind: string,
  type: string | undefined,
  ownerNames: string[],
): string {
  const params = new URLSearchParams();
  params.append('filters[kind]', kind.toLowerCase());
  if (type) params.append('filters[type]', type);
  for (const owner of ownerNames) {
    params.append('filters[owners]', owner);
  }
  params.append('filters[user]', 'all');
  return params.toString();
}
