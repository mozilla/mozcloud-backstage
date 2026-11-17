import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity, EntityLink } from '@backstage/catalog-model';
import {
  INCIDENT_ANNOTATION_KEYS,
  IncidentAnnotationKey,
  invalidIncidentReason,
  isValidIncidentValue,
} from '../transform/incident';

/** The tenant an overlay file is scoped to. */
export interface TenantScope {
  /** Tenant app_code; also the tenant's System entity name. */
  appCode: string;
  /** Default owner ref for new entities that don't set one. */
  owner: string;
  /**
   * Location ref (e.g. `mozcloud:overlay:https://github.com/.../catalog-info.yaml`)
   * of the overlay file. Stamped onto new entities as their managed-by-location
   * so the catalog can trace them back to the overlay, matching what the
   * BigQuery transforms set on generated entities. Use the `mozcloud:` scheme
   * (not `url:`/`file:`) so the AboutCard refresh button stays off.
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

const isIncidentKey = (key: string): key is IncidentAnnotationKey =>
  (INCIDENT_ANNOTATION_KEYS as string[]).includes(key);

type TenantIncident = Partial<Record<IncidentAnnotationKey, string>>;

/**
 * The incident annotations each generated entity carries, by entity ref.
 * Taken before any overlay is folded in, so a later merge can tell a value
 * the tenant set from one an earlier overlay document set.
 */
function tenantIncidentByRef(entities: Entity[]): Map<string, TenantIncident> {
  const out = new Map<string, TenantIncident>();
  for (const e of entities) {
    const found: TenantIncident = {};
    for (const [key, value] of Object.entries(e.metadata.annotations ?? {})) {
      if (isIncidentKey(key)) found[key] = value;
    }
    if (Object.keys(found).length > 0) out.set(entityRef(e), found);
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
 *
 * The exception is an incident annotation the tenant sets (`tenant`): the
 * overlay can't change it. `onTenantWins` is told about each one refused,
 * and overlay links to a refused value are dropped, or the Links card would
 * show two targets for one thing.
 */
function mergeEntity(
  base: Entity,
  overlay: Entity,
  tenant: TenantIncident,
  onTenantWins: (key: IncidentAnnotationKey) => void,
): Entity {
  const out: Entity = JSON.parse(JSON.stringify(base));
  const oMeta = (overlay.metadata ?? {}) as Record<string, unknown>;

  const refused = new Set<unknown>();
  const oAnnotations = isPlainObject(oMeta.annotations)
    ? Object.fromEntries(
        Object.entries(oMeta.annotations).filter(([key, value]) => {
          if (
            !isIncidentKey(key) ||
            tenant[key] === undefined ||
            value === tenant[key]
          ) {
            return true;
          }
          refused.add(value);
          onTenantWins(key);
          return false;
        }),
      )
    : undefined;

  for (const [k, v] of Object.entries(oMeta)) {
    if (k === 'name' || k === 'namespace') continue; // identity
    if (k === 'annotations' && oAnnotations) {
      out.metadata.annotations = {
        ...(out.metadata.annotations ?? {}),
        ...(oAnnotations as Record<string, string>),
      };
    } else if (k === 'tags' && Array.isArray(v)) {
      out.metadata.tags = unionTags(out.metadata.tags ?? [], v as string[]);
    } else if (k === 'links' && Array.isArray(v)) {
      out.metadata.links = unionLinks(
        out.metadata.links ?? [],
        (v as EntityLink[]).filter(l => !refused.has(l.url)),
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
  const tenantIncident = tenantIncidentByRef(generated);

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
      out[idx] = mergeEntity(
        out[idx],
        doc,
        tenantIncident.get(ref) ?? {},
        key =>
          logger.warn(
            `overlay ${scope.appCode}: ignoring ${key} on ${ref} — the tenant sets it`,
          ),
      );
    } else {
      const stamped = stampNewEntity(doc, scope);
      indexByRef.set(ref, out.length);
      out.push(stamped);
    }
  }
  return out;
}

/**
 * Drop incident annotations whose value is not in the format the tenant
 * schema requires (see `isValidIncidentValue`), warning for each. Tenant
 * values are checked as they are read, so this catches what overlays added,
 * on any entity. Returns a new array; inputs are not mutated.
 */
export function dropInvalidIncidentAnnotations(
  entities: Entity[],
  logger: LoggerService,
): Entity[] {
  return entities.map(entity => {
    const annotations = entity.metadata.annotations;
    if (!annotations) return entity;

    const kept: Record<string, string> = {};
    let dropped = false;
    for (const [key, value] of Object.entries(annotations)) {
      if (isIncidentKey(key) && !isValidIncidentValue(key, value)) {
        logger.warn(
          `overlay: dropping ${key} on ${entityRef(
            entity,
          )}: ${invalidIncidentReason(value)}`,
        );
        dropped = true;
      } else {
        kept[key] = value;
      }
    }
    return dropped
      ? { ...entity, metadata: { ...entity.metadata, annotations: kept } }
      : entity;
  });
}
