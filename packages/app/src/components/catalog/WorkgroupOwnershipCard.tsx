import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  CatalogApi,
  catalogApiRef,
  EntityInfoCard,
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
import { Link, Progress, ResponseErrorPanel } from '@backstage/core-components';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import {
  Box,
  Grid,
  Switch,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { useMemo, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';

const useStyles = makeStyles(theme => ({
  tile: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    padding: theme.spacing(2),
    textAlign: 'center' as const,
    height: '100%',
  },
  count: {
    fontWeight: 700,
  },
  empty: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic' as const,
  },
}));

interface Props {
  relationAggregation?: 'direct' | 'aggregated';
  hideRelationsToggle?: boolean;
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
 * This override extends the user-side walker to also include each
 * direct group's ancestors (via `RELATION_CHILD_OF`) when computing
 * the owners list. For Group entities we keep the same DOWN-walk via
 * `RELATION_PARENT_OF` as the original.
 */
export const WorkgroupOwnershipCard = (props: Props) => {
  const classes = useStyles();
  const { entity } = useEntity();
  const catalogApi = useApi(catalogApiRef);
  const catalogLink = useRouteRef(catalogPlugin.routes.catalogIndex);

  const defaultAggregation = entity.kind === 'User' ? 'aggregated' : 'direct';
  const [aggregation, setAggregation] = useState(
    props.relationAggregation ?? defaultAggregation,
  );
  const kinds = useMemo(
    () =>
      props.entityFilterKind ?? ['Component', 'API', 'System', 'Resource'],
    [props.entityFilterKind],
  );
  const entityLimit = props.entityLimit ?? 6;

  const { loading, error, value: counters } = useAsync(async () => {
    const owners = await getOwners(entity, aggregation, catalogApi);
    if (owners.length === 0) return [];
    const owned = await batchGetOwnedEntitiesByOwners(
      owners,
      kinds,
      catalogApi,
    );
    return reduceToCounters(owned, owners, entityLimit);
  }, [catalogApi, entity, aggregation, kinds, entityLimit]);

  const toggle = !props.hideRelationsToggle && (
    <Switch
      checked={aggregation !== 'direct'}
      onChange={(_, checked) =>
        setAggregation(checked ? 'aggregated' : 'direct')
      }
    />
  );

  return (
    <EntityInfoCard title="Ownership" headerActions={toggle}>
      {loading && <Progress />}
      {error && <ResponseErrorPanel error={error} />}
      {!loading && !error && (!counters || counters.length === 0) && (
        <Typography className={classes.empty}>Nothing owned.</Typography>
      )}
      {counters && counters.length > 0 && (
        <Grid container spacing={2}>
          {counters.map(c => {
            const url = catalogLink ? `${catalogLink()}?${c.query}` : undefined;
            const tile = (
              <Box className={classes.tile}>
                <Typography variant="h6" className={classes.count}>
                  {c.count}
                </Typography>
                <Typography variant="subtitle2">
                  {(c.type ?? c.kind).toUpperCase()}
                </Typography>
                {c.type && (
                  <Typography variant="caption">{c.kind}</Typography>
                )}
              </Box>
            );
            return (
              <Grid key={`${c.kind}:${c.type ?? ''}`} item xs={6} md={4}>
                {url ? <Link to={url}>{tile}</Link> : tile}
              </Grid>
            );
          })}
        </Grid>
      )}
    </EntityInfoCard>
  );
};

async function getOwners(
  entity: Entity,
  aggregation: 'direct' | 'aggregated',
  catalogApi: CatalogApi,
): Promise<string[]> {
  if (aggregation !== 'aggregated') {
    return [stringifyEntityRef(entity)];
  }
  if (entity.kind === 'User') {
    return getUserOwnersWithAncestors(entity, catalogApi);
  }
  if (entity.kind === 'Group') {
    return getGroupDescendantRefs(entity, catalogApi);
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
 * Group aggregated mode: walk DOWN via `RELATION_PARENT_OF` collecting
 * every descendant group. Mirrors the org plugin's behavior.
 */
async function getGroupDescendantRefs(
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
      const children = getEntityRelations(g, RELATION_PARENT_OF, {
        kind: 'Group',
      }).map(r => stringifyEntityRef(r));
      for (const c of children) {
        if (owners.has(c)) continue;
        owners.add(c);
        frontier.push(c);
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
    ref => entityPresentationSnapshot(ref, { defaultKind: 'group' }).primaryTitle,
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
