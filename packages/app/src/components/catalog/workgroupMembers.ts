import {
  CompoundEntityRef,
  DEFAULT_NAMESPACE,
  Entity,
  parseEntityRef,
  RELATION_PARENT_OF,
  stringifyEntityRef,
} from '@backstage/catalog-model';

/**
 * Child Group refs of an entity via `RELATION_PARENT_OF`. Inlined (rather than
 * `getEntityRelations` from `@backstage/plugin-catalog-react`) so this module
 * depends only on the pure `@backstage/catalog-model` — no transitive React/UI
 * barrel, so it's genuinely React-free and cleanly unit-testable.
 */
function childGroupRefs(entity: Entity): CompoundEntityRef[] {
  return (entity.relations ?? [])
    .filter(r => r.type === RELATION_PARENT_OF)
    .map(r => parseEntityRef(r.targetRef))
    .filter(ref => ref.kind.toLocaleLowerCase('en-US') === 'group');
}

/**
 * Org-wide admin subgroups composed into ~every workgroup. Their users flood
 * aggregated Members cards, so they are pruned from a group's aggregated list
 * unless that group (or its parent workgroup) is being viewed directly.
 */
export const EXCLUDED_ADMIN_GROUPS = [
  'group:workgroups/sre-admins',
  'group:workgroups/cloud-engineering-admins',
];

/** Roots for which pruning is disabled: the excluded groups + their parents. */
const PRUNE_EXEMPT_ROOTS = [
  ...EXCLUDED_ADMIN_GROUPS,
  'group:workgroups/sre',
  'group:workgroups/cloud-engineering',
];

const lc = (ref: string) => ref.toLocaleLowerCase('en-US');
const EXCLUDED = new Set(EXCLUDED_ADMIN_GROUPS.map(lc));
const EXEMPT = new Set(PRUNE_EXEMPT_ROOTS.map(lc));

/** Whether the excluded admin branches should be pruned for this root entity. */
export function shouldPrune(root: Entity): boolean {
  return !EXEMPT.has(lc(stringifyEntityRef(root)));
}

/** The subset of CatalogApi this module needs (keeps it unit-testable). */
export interface MembersCatalog {
  getEntityByRef(ref: CompoundEntityRef | string): Promise<Entity | undefined>;
  getEntities(request: {
    filter: Record<string, string | string[]>;
  }): Promise<{ items: Entity[] }>;
}

function refOf(entity: Entity): CompoundEntityRef {
  return {
    kind: entity.kind,
    namespace: entity.metadata.namespace ?? DEFAULT_NAMESPACE,
    name: entity.metadata.name,
  };
}

/**
 * BFS over `RELATION_PARENT_OF` child groups (mirrors the org plugin's
 * `getDescendantGroupsFromGroup`), skipping the excluded admin branches when
 * `prune` is set. Returns descendant group refs (excluding the root).
 */
async function prunedDescendantGroups(
  root: Entity,
  catalog: MembersCatalog,
  prune: boolean,
): Promise<CompoundEntityRef[]> {
  const seen = new Set<string>([lc(stringifyEntityRef(refOf(root)))]);
  const queue: CompoundEntityRef[] = [refOf(root)];
  const result: CompoundEntityRef[] = [];
  while (queue.length > 0) {
    const entity = await catalog.getEntityByRef(queue.shift()!);
    if (!entity) continue;
    const children = childGroupRefs(entity).filter(child => {
      const key = lc(stringifyEntityRef(child));
      if (seen.has(key)) return false;
      if (prune && EXCLUDED.has(key)) return false;
      return true;
    });
    for (const child of children) seen.add(lc(stringifyEntityRef(child)));
    queue.push(...children);
    result.push(...children);
  }
  return result;
}

async function membersOf(
  groups: CompoundEntityRef[],
  catalog: MembersCatalog,
): Promise<Entity[]> {
  if (groups.length === 0) return [];
  const { items } = await catalog.getEntities({
    filter: {
      kind: 'User',
      'relations.memberof': groups.map(g =>
        stringifyEntityRef({
          kind: 'group',
          namespace: lc(g.namespace ?? DEFAULT_NAMESPACE),
          name: lc(g.name),
        }),
      ),
    },
  });
  return items;
}

/** Dedupe by entity ref and return a stable, ref-sorted list. */
function dedupe(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  return entities
    .filter(e => {
      const key = stringifyEntityRef(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => stringifyEntityRef(a).localeCompare(stringifyEntityRef(b)));
}

/**
 * Direct members of `root`, plus (when `aggregated`) members of all descendant
 * groups with the excluded admin branches pruned per {@link shouldPrune}.
 */
export async function aggregateMembers(
  root: Entity,
  catalog: MembersCatalog,
  aggregated: boolean,
): Promise<Entity[]> {
  const direct = await membersOf([refOf(root)], catalog);
  if (!aggregated) return dedupe(direct);
  const descendants = await prunedDescendantGroups(
    root,
    catalog,
    shouldPrune(root),
  );
  const descendantMembers = await membersOf(descendants, catalog);
  return dedupe([...direct, ...descendantMembers]);
}
