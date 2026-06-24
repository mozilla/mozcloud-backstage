import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity, EntityLink } from '@backstage/catalog-model';

/** The tenant an overlay file is scoped to. */
export interface TenantScope {
  /** Tenant app_code; also the tenant's System entity name. */
  appCode: string;
  /** Default owner ref for new entities that don't set one. */
  owner: string;
  /**
   * Location ref (e.g. `url:https://github.com/.../catalog-info.yaml`) of the
   * overlay file. Stamped onto new entities as their managed-by-location so the
   * catalog can trace them back to the overlay, matching what the BigQuery
   * transforms set on generated entities.
   */
  location: string;
}

/** `kind:namespace/name`, lowercased, namespace defaulting to `default`. */
export function entityRef(entity: Entity): string {
  const ns = entity.metadata.namespace ?? 'default';
  return `${entity.kind}:${ns}/${entity.metadata.name}`.toLowerCase();
}

/**
 * Whether an entity belongs to the given tenant. True for the tenant's
 * own System (named after the app_code) and for any entity attached to
 * that System via `spec.system`. helm-deployment sub-Components use
 * `spec.subcomponentOf` rather than `spec.system`, so they are not
 * directly addressable by overlays — overlays target the chart Component
 * or the System instead.
 */
export function belongsToTenant(entity: Entity, appCode: string): boolean {
  if (entity.kind === 'System' && entity.metadata.name === appCode) return true;
  const system = (entity.spec as Record<string, unknown> | undefined)?.system;
  return system === appCode;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Union two string arrays, preserving first-seen order, deduped. */
function unionTags(base: string[], extra: string[]): string[] {
  const out = [...base];
  for (const t of extra) if (!out.includes(t)) out.push(t);
  return out;
}

/** Union two link arrays, deduping by `url` (base wins on conflict). */
function unionLinks(base: EntityLink[], extra: EntityLink[]): EntityLink[] {
  const seen = new Set(base.map(l => l.url));
  const out = [...base];
  for (const l of extra) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  return out;
}

/** Deep-merge plain-object maps; overlay wins on scalars and arrays. */
function deepMergeMaps(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeMaps(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Merge an overlay document onto a generated entity. Identity fields
 * (`kind`, `metadata.name`, `metadata.namespace`, `apiVersion`) are taken
 * from the base. `metadata.annotations` is key-merged (overlay keys win;
 * a one-level spread, since annotation values are strings),
 * `metadata.tags`/`metadata.links` append+dedup, every other metadata key
 * and all of `spec` follow last-writer-wins with overlay winning.
 */
function mergeEntity(base: Entity, overlay: Entity): Entity {
  const out: Entity = JSON.parse(JSON.stringify(base));
  const oMeta = (overlay.metadata ?? {}) as Record<string, unknown>;

  for (const [k, v] of Object.entries(oMeta)) {
    if (k === 'name' || k === 'namespace') continue; // identity
    if (k === 'annotations' && isPlainObject(v)) {
      out.metadata.annotations = {
        ...(out.metadata.annotations ?? {}),
        ...(v as Record<string, string>),
      };
    } else if (k === 'tags' && Array.isArray(v)) {
      out.metadata.tags = unionTags(out.metadata.tags ?? [], v as string[]);
    } else if (k === 'links' && Array.isArray(v)) {
      out.metadata.links = unionLinks(
        out.metadata.links ?? [],
        v as EntityLink[],
      );
    } else {
      (out.metadata as Record<string, unknown>)[k] = v;
    }
  }

  if (isPlainObject(overlay.spec)) {
    out.spec = deepMergeMaps(
      (out.spec ?? {}) as Record<string, unknown>,
      overlay.spec as Record<string, unknown>,
    ) as Entity['spec'];
  }
  return out;
}

/** Stamp a brand-new overlay entity into the tenant's System. */
function stampNewEntity(entity: Entity, scope: TenantScope): Entity {
  const out: Entity = JSON.parse(JSON.stringify(entity));
  const spec = (out.spec ?? {}) as Record<string, unknown>;
  spec.system = scope.appCode; // forced — a new entity always joins this tenant
  if (spec.owner === undefined) spec.owner = scope.owner;
  out.spec = spec as Entity['spec'];
  // New entities have no managed-by-location of their own; point it at the
  // overlay file so the catalog can trace them (and stop warning). Forced over
  // any author-supplied value — these are location annotations the platform owns.
  out.metadata.annotations = {
    ...(out.metadata.annotations ?? {}),
    'backstage.io/managed-by-location': scope.location,
    'backstage.io/managed-by-origin-location': scope.location,
  };
  return out;
}

/**
 * Fold a tenant's overlay entities into the generated entity set.
 * Returns a new array; inputs are not mutated.
 */
export function mergeOverlayEntities(
  generated: Entity[],
  overlay: Entity[],
  scope: TenantScope,
  logger: LoggerService,
): Entity[] {
  const out = [...generated];
  const indexByRef = new Map<string, number>();
  out.forEach((e, i) => indexByRef.set(entityRef(e), i));

  for (const doc of overlay) {
    const ref = entityRef(doc);
    const idx = indexByRef.get(ref);
    if (idx !== undefined) {
      if (!belongsToTenant(out[idx], scope.appCode)) {
        logger.warn(
          `overlay ${scope.appCode}: ignoring override of ${ref} — it belongs to another tenant`,
        );
        continue;
      }
      out[idx] = mergeEntity(out[idx], doc);
    } else {
      const stamped = stampNewEntity(doc, scope);
      indexByRef.set(ref, out.length);
      out.push(stamped);
    }
  }
  return out;
}
