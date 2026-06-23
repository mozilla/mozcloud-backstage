# Tenant Catalog Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tenant owners add and enrich their Backstage catalog entities by authoring a `catalog-info.yaml` overlay file that the existing `MozcloudTenantEntityProvider` fetches and folds into its single full mutation.

**Architecture:** Three pure/IO-isolated helpers under `plugins/catalog-backend-module-mozcloud/src/overlay/` — `parseOverlay` (YAML → validated entities), `fetchTenantOverlay` (UrlReader + path templating + 404 handling), and `mergeOverlay` (ref-match, tenant-scope guard, deep-merge / append-dedup, new-entity stamping). The provider calls these per tenant after building BigQuery entities and before its existing dedup + full-mutation step. No new ingestion path; no entity-ref collisions.

**Tech Stack:** TypeScript, Backstage backend-plugin-api (`UrlReaderService`), `js-yaml` (already a dependency), `@backstage/catalog-model` `Entity`/`EntityLink`, Jest via `backstage-cli package test`.

## Global Constraints

- Node pinned to **24.16.0** (`.nvmrc`); run `nvm use` before any node/yarn command (Homebrew node shadows nvm).
- Run package tests with `backstage-cli package test --no-watch` (watch mode hangs).
- Do **not** add `Co-Authored-By` trailers to commits.
- New overlay files are internal to the module — do **not** export them from `src/index.ts`.
- Match existing code idioms: skip-and-log on bad input (mirror `BigQuerySource`), `pickDefined`-style helpers, no new runtime dependencies.
- All work happens in `plugins/catalog-backend-module-mozcloud/`. Branch already in use: `feat/tenant-catalog-overlays`.

---

### Task 1: `parseOverlay` — YAML to validated entities

**Files:**
- Create: `plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.ts`
- Test: `plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. `LoggerService` from `@backstage/backend-plugin-api`; `Entity` from `@backstage/catalog-model`; `load`/`loadAll` from `js-yaml`.
- Produces:
  - `export function parseOverlay(content: string, opts: { description: string; logger: LoggerService }): Entity[]`
  - `export function isEntity(value: unknown): value is Entity`
  - Never throws. Malformed YAML → `[]` + `logger.warn`. Each non-entity document → skipped + `logger.warn`. Supports multi-document (`---`) YAML.

- [ ] **Step 1: Write the failing test**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.test.ts
import { mockServices } from '@backstage/backend-test-utils';
import { parseOverlay, isEntity } from './parseOverlay';

const opts = () => ({ description: 'overlay:test', logger: mockServices.logger.mock() });

describe('parseOverlay', () => {
  it('parses a multi-document file into entities', () => {
    const yaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: merino
spec:
  owner: group:workgroups/merino
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: merino-suggest
spec:
  type: openapi
  lifecycle: production
  owner: group:workgroups/merino
`;
    const entities = parseOverlay(yaml, opts());
    expect(entities.map(e => `${e.kind}:${e.metadata.name}`)).toEqual([
      'System:merino',
      'API:merino-suggest',
    ]);
  });

  it('returns [] and logs on malformed YAML', () => {
    const logger = mockServices.logger.mock();
    const result = parseOverlay('this: : : not: valid', { description: 'overlay:test', logger });
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips documents that are not entities', () => {
    const logger = mockServices.logger.mock();
    const yaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: merino
---
just-a-string
---
kind: NoApiVersion
metadata:
  name: bad
`;
    const result = parseOverlay(yaml, { description: 'overlay:test', logger });
    expect(result.map(e => e.metadata.name)).toEqual(['merino']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('isEntity accepts a well-formed entity and rejects junk', () => {
    expect(isEntity({ apiVersion: 'v1', kind: 'API', metadata: { name: 'x' } })).toBe(true);
    expect(isEntity({ kind: 'API', metadata: { name: 'x' } })).toBe(false);
    expect(isEntity({ apiVersion: 'v1', kind: 'API', metadata: {} })).toBe(false);
    expect(isEntity('nope')).toBe(false);
    expect(isEntity(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/parseOverlay.test.ts`
Expected: FAIL — `Cannot find module './parseOverlay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { loadAll } from 'js-yaml';

/**
 * Type guard for the minimum shape Backstage requires to identify an
 * entity: `apiVersion`, `kind`, and `metadata.name` must all be strings.
 * Looser than full catalog validation on purpose — the catalog engine
 * does the rigorous validation when the mutation is applied; this only
 * filters out obvious non-entities (scalars, partial docs) so they never
 * reach the merge step.
 */
export function isEntity(value: unknown): value is Entity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const metadata = v.metadata as Record<string, unknown> | undefined;
  return (
    typeof v.apiVersion === 'string' &&
    typeof v.kind === 'string' &&
    !!metadata &&
    typeof metadata === 'object' &&
    typeof metadata.name === 'string'
  );
}

/**
 * Parse an owner-authored overlay file into Backstage entities.
 *
 * Resilient by design — mirrors the skip-and-log contract of
 * {@link defineBigQuerySource}. A whole-file YAML syntax error logs a
 * warning and yields `[]`; an individual document that is not a valid
 * entity is skipped and logged. Never throws, so one bad overlay can't
 * abort a provider refresh.
 */
export function parseOverlay(
  content: string,
  opts: { description: string; logger: LoggerService },
): Entity[] {
  let docs: unknown[];
  try {
    docs = loadAll(content) as unknown[];
  } catch (error) {
    opts.logger.warn(
      `${opts.description}: failed to parse YAML: ${(error as Error).message}`,
    );
    return [];
  }

  const out: Entity[] = [];
  for (const doc of docs) {
    if (doc === null || doc === undefined) continue; // empty trailing doc
    if (!isEntity(doc)) {
      opts.logger.warn(
        `${opts.description}: skipping document that is not a valid entity`,
      );
      continue;
    }
    out.push(doc);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/parseOverlay.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.ts plugins/catalog-backend-module-mozcloud/src/overlay/parseOverlay.test.ts
git commit -m "feat(overlay): parse owner-authored catalog-info.yaml into entities"
```

---

### Task 2: `mergeOverlay` — tenant-scoped merge semantics

**Files:**
- Create: `plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.ts`
- Test: `plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.test.ts`

**Interfaces:**
- Consumes: `Entity`, `EntityLink` from `@backstage/catalog-model`; `LoggerService` from `@backstage/backend-plugin-api`.
- Produces:
  - `export interface TenantScope { appCode: string; owner: string; }`
  - `export function entityRef(entity: Entity): string` — `kind:namespace/name`, lowercased, namespace defaults to `default`.
  - `export function belongsToTenant(entity: Entity, appCode: string): boolean` — true when `kind===System && name===appCode`, or `spec.system===appCode`.
  - `export function mergeOverlayEntities(generated: Entity[], overlay: Entity[], scope: TenantScope, logger: LoggerService): Entity[]` — returns a new array. Overlay docs whose ref matches a generated entity that belongs to the tenant are deep-merged (overlay scalars win, maps deep-merge, `metadata.tags`/`metadata.links` append+dedup). A matched entity belonging to another tenant is skipped + warned. An unmatched overlay doc becomes a new entity stamped with `spec.system = appCode` and (if unset) `spec.owner = scope.owner`.

- [ ] **Step 1: Write the failing test**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.test.ts
import { mockServices } from '@backstage/backend-test-utils';
import { Entity } from '@backstage/catalog-model';
import {
  entityRef,
  belongsToTenant,
  mergeOverlayEntities,
  TenantScope,
} from './mergeOverlay';

const scope: TenantScope = { appCode: 'merino', owner: 'group:workgroups/merino' };
const logger = () => mockServices.logger.mock();

const generated = (): Entity[] => [
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: 'merino',
      tags: ['webservices', 'risk-high'],
      annotations: { 'mozilla.org/function': 'webservices' },
      links: [{ url: 'https://a', title: 'A' }],
    },
    spec: { owner: 'group:workgroups/merino', domain: 'webservices' },
  },
  {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: { name: 'other-tenant' },
    spec: { owner: 'group:workgroups/other' },
  },
];

describe('entityRef', () => {
  it('builds a lowercased kind:namespace/name ref with default namespace', () => {
    expect(entityRef({ kind: 'System', metadata: { name: 'Merino' } } as Entity)).toBe(
      'system:default/merino',
    );
    expect(
      entityRef({ kind: 'API', metadata: { name: 'x', namespace: 'NS' } } as Entity),
    ).toBe('api:ns/x');
  });
});

describe('belongsToTenant', () => {
  it('matches the tenant System by name', () => {
    expect(belongsToTenant(generated()[0], 'merino')).toBe(true);
  });
  it('matches an entity via spec.system', () => {
    const c = { kind: 'Component', metadata: { name: 'svc' }, spec: { system: 'merino' } } as Entity;
    expect(belongsToTenant(c, 'merino')).toBe(true);
  });
  it('rejects another tenant', () => {
    expect(belongsToTenant(generated()[1], 'merino')).toBe(false);
  });
});

describe('mergeOverlayEntities', () => {
  it('overrides scalar and deep-merges annotations on a matching tenant entity', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
          name: 'merino',
          description: 'The Merino suggestion service',
          annotations: { 'mozilla.org/slack-channel': '#merino' },
        },
        spec: { lifecycle: 'production' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const sys = out.find(e => e.metadata.name === 'merino')!;
    expect(sys.metadata.description).toBe('The Merino suggestion service');
    expect(sys.metadata.annotations).toEqual({
      'mozilla.org/function': 'webservices',
      'mozilla.org/slack-channel': '#merino',
    });
    expect((sys.spec as any).lifecycle).toBe('production');
    expect((sys.spec as any).domain).toBe('webservices'); // untouched base field kept
  });

  it('appends and dedupes tags and links rather than replacing', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: {
          name: 'merino',
          tags: ['risk-high', 'public-api'],
          links: [{ url: 'https://a', title: 'A dup' }, { url: 'https://b', title: 'B' }],
        },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const sys = out.find(e => e.metadata.name === 'merino')!;
    expect(sys.metadata.tags).toEqual(['webservices', 'risk-high', 'public-api']);
    expect(sys.metadata.links).toEqual([
      { url: 'https://a', title: 'A' },
      { url: 'https://b', title: 'B' },
    ]);
  });

  it('ignores and warns when overriding an entity from another tenant', () => {
    const log = logger();
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'System',
        metadata: { name: 'other-tenant', description: 'hijack attempt' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, log);
    const other = out.find(e => e.metadata.name === 'other-tenant')!;
    expect(other.metadata.description).toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('stamps a new entity with the tenant system and default owner', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: { name: 'merino-suggest' },
        spec: { type: 'openapi', lifecycle: 'production' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const api = out.find(e => e.metadata.name === 'merino-suggest')!;
    expect((api.spec as any).system).toBe('merino');
    expect((api.spec as any).owner).toBe('group:workgroups/merino');
    expect(out).toHaveLength(3);
  });

  it('keeps an explicit owner on a new entity but still forces system', () => {
    const overlay: Entity[] = [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'API',
        metadata: { name: 'merino-suggest' },
        spec: { type: 'openapi', owner: 'group:workgroups/merino-api', system: 'wrong' },
      },
    ];
    const out = mergeOverlayEntities(generated(), overlay, scope, logger());
    const api = out.find(e => e.metadata.name === 'merino-suggest')!;
    expect((api.spec as any).owner).toBe('group:workgroups/merino-api');
    expect((api.spec as any).system).toBe('merino'); // forced into this tenant
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/mergeOverlay.test.ts`
Expected: FAIL — `Cannot find module './mergeOverlay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity, EntityLink } from '@backstage/catalog-model';

/** The tenant an overlay file is scoped to. */
export interface TenantScope {
  /** Tenant app_code; also the tenant's System entity name. */
  appCode: string;
  /** Default owner ref for new entities that don't set one. */
  owner: string;
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
 * from the base. `metadata.annotations` deep-merges (overlay keys win),
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
      out.metadata.links = unionLinks(out.metadata.links ?? [], v as EntityLink[]);
    } else {
      (out.metadata as Record<string, unknown>)[k] = v;
    }
  }

  if (isPlainObject(overlay.spec)) {
    out.spec = deepMergeMaps(
      (out.spec ?? {}) as Record<string, unknown>,
      overlay.spec as Record<string, unknown>,
    );
  }
  return out;
}

/** Stamp a brand-new overlay entity into the tenant's System. */
function stampNewEntity(entity: Entity, scope: TenantScope): Entity {
  const out: Entity = JSON.parse(JSON.stringify(entity));
  const spec = (out.spec ?? {}) as Record<string, unknown>;
  spec.system = scope.appCode; // forced — a new entity always joins this tenant
  if (spec.owner === undefined) spec.owner = scope.owner;
  out.spec = spec;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/mergeOverlay.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.ts plugins/catalog-backend-module-mozcloud/src/overlay/mergeOverlay.test.ts
git commit -m "feat(overlay): tenant-scoped merge of overlay entities"
```

---

### Task 3: `fetchTenantOverlay` — URL templating + UrlReader fetch

**Files:**
- Create: `plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.ts`
- Test: `plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.test.ts`

**Interfaces:**
- Consumes: `UrlReaderService`, `LoggerService` from `@backstage/backend-plugin-api`; `Config` from `@backstage/config`.
- Produces:
  - `export interface OverlayConfig { enabled: boolean; repoUrlTemplate: string; pathTemplate: string; branch: string; }`
  - `export function readOverlayConfig(config: Config): OverlayConfig | undefined` — reads the optional `overlay` block from a tenants config; returns `undefined` when absent or `enabled !== true`.
  - `export function overlayUrl(cfg: OverlayConfig, vars: { function: string; app_code: string }): string` — substitutes `{function}` and `{app_code}` into `${repoUrlTemplate}/blob/${branch}/${pathTemplate}`.
  - `export async function fetchTenantOverlay(reader: UrlReaderService, cfg: OverlayConfig, vars: { function: string; app_code: string }, logger: LoggerService): Promise<string | undefined>` — returns file contents, or `undefined` when the file is absent (`NotFoundError`). Other read errors are re-thrown for the caller's per-tenant try/catch.

- [ ] **Step 1: Write the failing test**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.test.ts
import { mockServices } from '@backstage/backend-test-utils';
import { UrlReaderService } from '@backstage/backend-plugin-api';
import {
  OverlayConfig,
  overlayUrl,
  fetchTenantOverlay,
} from './fetchTenantOverlay';

const cfg: OverlayConfig = {
  enabled: true,
  repoUrlTemplate: 'https://github.com/mozilla/{function}-infra',
  pathTemplate: '{app_code}/catalog-info.yaml',
  branch: 'main',
};
const vars = { function: 'webservices', app_code: 'merino' };

function fakeReader(impl: Partial<UrlReaderService>): UrlReaderService {
  return impl as unknown as UrlReaderService;
}

describe('overlayUrl', () => {
  it('substitutes function and app_code into the blob URL', () => {
    expect(overlayUrl(cfg, vars)).toBe(
      'https://github.com/mozilla/webservices-infra/blob/main/merino/catalog-info.yaml',
    );
  });
});

describe('fetchTenantOverlay', () => {
  it('returns file contents on success', async () => {
    const reader = fakeReader({
      readUrl: async () => ({ buffer: async () => Buffer.from('kind: API') } as any),
    });
    const result = await fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock());
    expect(result).toBe('kind: API');
  });

  it('returns undefined when the file is not found', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFoundError' });
    const reader = fakeReader({
      readUrl: async () => {
        throw notFound;
      },
    });
    const result = await fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock());
    expect(result).toBeUndefined();
  });

  it('rethrows non-NotFound errors', async () => {
    const reader = fakeReader({
      readUrl: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock()),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/fetchTenantOverlay.test.ts`
Expected: FAIL — `Cannot find module './fetchTenantOverlay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.ts
import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';

/** Resolved `catalog.providers.mozcloud.tenants.overlay` config. */
export interface OverlayConfig {
  enabled: boolean;
  /** e.g. `https://github.com/mozilla/{function}-infra` */
  repoUrlTemplate: string;
  /** e.g. `{app_code}/catalog-info.yaml` */
  pathTemplate: string;
  /** Branch the file lives on, e.g. `main`. */
  branch: string;
}

/**
 * Read the optional `overlay` block from a tenants config. Returns
 * `undefined` when the block is absent or `enabled` is not `true`, so the
 * provider can treat overlays as opt-in.
 */
export function readOverlayConfig(config: Config): OverlayConfig | undefined {
  const overlay = config.getOptionalConfig('overlay');
  if (!overlay) return undefined;
  if (overlay.getOptionalBoolean('enabled') !== true) return undefined;
  return {
    enabled: true,
    repoUrlTemplate: overlay.getString('repoUrlTemplate'),
    pathTemplate: overlay.getString('pathTemplate'),
    branch: overlay.getOptionalString('branch') ?? 'main',
  };
}

function substitute(
  template: string,
  vars: { function: string; app_code: string },
): string {
  return template
    .replace(/\{function\}/g, vars.function)
    .replace(/\{app_code\}/g, vars.app_code);
}

/** Build the absolute blob URL for a tenant's overlay file. */
export function overlayUrl(
  cfg: OverlayConfig,
  vars: { function: string; app_code: string },
): string {
  const repo = substitute(cfg.repoUrlTemplate, vars);
  const path = substitute(cfg.pathTemplate, vars);
  return `${repo}/blob/${cfg.branch}/${path}`;
}

/**
 * Fetch a tenant's overlay file via the backend UrlReader (which uses the
 * configured GitHub integration credentials). A missing file is the common
 * case — most tenants have no overlay — and resolves to `undefined`. Other
 * read failures propagate to the caller's per-tenant try/catch.
 */
export async function fetchTenantOverlay(
  reader: UrlReaderService,
  cfg: OverlayConfig,
  vars: { function: string; app_code: string },
  logger: LoggerService,
): Promise<string | undefined> {
  const url = overlayUrl(cfg, vars);
  try {
    const response = await reader.readUrl(url);
    const buffer = await response.buffer();
    return buffer.toString('utf8');
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFoundError') {
      logger.debug(`overlay ${vars.app_code}: no overlay file at ${url}`);
      return undefined;
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/overlay/fetchTenantOverlay.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.ts plugins/catalog-backend-module-mozcloud/src/overlay/fetchTenantOverlay.test.ts
git commit -m "feat(overlay): fetch per-tenant overlay file via UrlReader"
```

---

### Task 4: Wire overlays into the provider, config, and module

**Files:**
- Modify: `plugins/catalog-backend-module-mozcloud/src/MozcloudTenantEntityProvider.ts`
- Modify: `plugins/catalog-backend-module-mozcloud/src/MozcloudTenantEntityProvider.test.ts`
- Modify: `plugins/catalog-backend-module-mozcloud/src/module.ts`
- Modify: `plugins/catalog-backend-module-mozcloud/config.d.ts`
- Modify: `app-config.yaml`

**Interfaces:**
- Consumes: `parseOverlay` (Task 1), `mergeOverlayEntities` + `TenantScope` (Task 2), `fetchTenantOverlay` + `readOverlayConfig` + `OverlayConfig` (Task 3); `UrlReaderService` from `@backstage/backend-plugin-api`; `tenantOwner` from `./transform/refs`.
- Produces: `MozcloudTenantEntityProvider` constructor gains two optional trailing params `reader?: UrlReaderService, overlay?: OverlayConfig`; `createFromConfig` gains a `reader: UrlReaderService` param (inserted before `scheduler`). Existing 4-arg `new MozcloudTenantEntityProvider(...)` calls remain valid (new params optional).

- [ ] **Step 1: Write the failing test (provider applies overlays)**

Add this test to `src/MozcloudTenantEntityProvider.test.ts`. It reuses the file's existing `TENANT_A`, `FakeSource`, and `ImmediateTaskRunner`.

```ts
// add imports at top of MozcloudTenantEntityProvider.test.ts
import { UrlReaderService } from '@backstage/backend-plugin-api';
import { OverlayConfig } from './overlay/fetchTenantOverlay';

// add inside describe('MozcloudTenantEntityProvider', () => { ... })
it('merges a tenant overlay: enriches the System and adds a new entity', async () => {
  const overlayYaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: service-a
  description: Service A overlay description
  tags:
    - extra-tag
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: service-a-public
spec:
  type: openapi
  lifecycle: production
`;
  const reader = {
    readUrl: async () => ({ buffer: async () => Buffer.from(overlayYaml) }),
  } as unknown as UrlReaderService;

  const overlay: OverlayConfig = {
    enabled: true,
    repoUrlTemplate: 'https://github.com/mozilla/{function}-infra',
    pathTemplate: '{app_code}/catalog-info.yaml',
    branch: 'main',
  };

  const captured: EntityProviderMutation[] = [];
  const connection: EntityProviderConnection = {
    applyMutation: async m => {
      captured.push(m);
    },
    refresh: async () => {},
  };

  const provider = new MozcloudTenantEntityProvider(
    new FakeSource<TenantRow>('fake-tenants:in-memory', [TENANT_A]),
    new FakeSource<ChartDeploymentsRow>('fake-charts:in-memory', []),
    mockServices.logger.mock(),
    new ImmediateTaskRunner(),
    reader,
    overlay,
  );

  await provider.connect(connection);

  if (captured[0].type !== 'full') throw new Error('unreachable');
  const entities = captured[0].entities.map(e => e.entity);

  const systemA = entities.find(
    e => e.kind === 'System' && e.metadata.name === 'service-a',
  )!;
  expect(systemA.metadata.description).toBe('Service A overlay description');
  expect(systemA.metadata.tags).toEqual(
    expect.arrayContaining(['webservices', 'risk-high', 'extra-tag']),
  );

  const newApi = entities.find(e => e.kind === 'API' && e.metadata.name === 'service-a-public')!;
  expect(newApi).toBeDefined();
  expect((newApi.spec as any).system).toBe('service-a');
  expect((newApi.spec as any).owner).toBe('group:workgroups/team-x');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch src/MozcloudTenantEntityProvider.test.ts`
Expected: FAIL — constructor only takes 4 args / overlay not applied (the new API and description are missing).

- [ ] **Step 3: Update the provider**

In `src/MozcloudTenantEntityProvider.ts`, add imports near the existing ones:

```ts
import { UrlReaderService } from '@backstage/backend-plugin-api';
import { tenantOwner } from './transform/refs';
import { parseOverlay } from './overlay/parseOverlay';
import { mergeOverlayEntities, TenantScope } from './overlay/mergeOverlay';
import {
  fetchTenantOverlay,
  readOverlayConfig,
  OverlayConfig,
} from './overlay/fetchTenantOverlay';
```

Extend the constructor (add two optional trailing params):

```ts
  constructor(
    private readonly tenantsSource: Source<TenantRow>,
    private readonly chartsSource: Source<ChartDeploymentsRow>,
    private readonly logger: LoggerService,
    private readonly taskRunner: SchedulerServiceTaskRunner,
    private readonly reader?: UrlReaderService,
    private readonly overlay?: OverlayConfig,
  ) {
    this.description = `tenants: ${tenantsSource.description}, charts: ${chartsSource.description}`;
  }
```

In `refresh()`, replace the block between building `entities` and `const deduped = ...` so overlays merge first:

```ts
    for (const tenant of tenants) {
      entities.push(...tenantToEntities(tenant, tenantsLocationRef));
    }

    for (const chart of charts) {
      entities.push(...chartToEntities(chart, chartsLocationRef));
    }

    let merged = entities;
    if (this.overlay?.enabled && this.reader) {
      merged = await this.applyOverlays(merged, tenants);
    }

    const deduped = dedupeByEntityRef(merged);
```

Add a private method (place it just below `refresh`):

```ts
  /**
   * Fetch and merge each tenant's overlay file into the generated entity
   * set. Per-tenant isolation: a failed fetch/parse/merge for one tenant
   * is logged and skipped — it never aborts the refresh or drops the
   * BigQuery-generated entities.
   */
  private async applyOverlays(
    entities: Entity[],
    tenants: TenantRow[],
  ): Promise<Entity[]> {
    if (!this.overlay || !this.reader) return entities;
    let merged = entities;
    for (const tenant of tenants) {
      const appCode = tenant.globals.app_code;
      const fn = tenant.globals.function;
      const scope: TenantScope = {
        appCode,
        owner: tenantOwner(tenant.globals.workgroups),
      };
      try {
        const content = await fetchTenantOverlay(
          this.reader,
          this.overlay,
          { function: fn, app_code: appCode },
          this.logger,
        );
        if (!content) continue;
        const overlayEntities = parseOverlay(content, {
          description: `overlay:${appCode}`,
          logger: this.logger,
        });
        if (overlayEntities.length === 0) continue;
        merged = mergeOverlayEntities(
          merged,
          overlayEntities,
          scope,
          this.logger,
        );
        this.logger.info(
          `${this.getProviderName()}: applied overlay for ${appCode} (${overlayEntities.length} docs)`,
        );
      } catch (error) {
        this.logger.warn(
          `${this.getProviderName()}: overlay for ${appCode} failed: ${
            (error as Error).message
          }`,
        );
      }
    }
    return merged;
  }
```

Update `createFromConfig` to accept the reader and read overlay config. Change its signature and the final `return`:

```ts
  static createFromConfig(
    config: Config,
    logger: LoggerService,
    reader: UrlReaderService,
    scheduler: SchedulerService,
  ): MozcloudTenantEntityProvider {
    // ... existing tenantsSource / chartsSource / schedule / taskRunner ...

    const overlay = readOverlayConfig(config);

    return new MozcloudTenantEntityProvider(
      tenantsSource,
      chartsSource,
      logger,
      taskRunner,
      reader,
      overlay,
    );
  }
```

- [ ] **Step 4: Update the module wiring**

In `src/module.ts`, add `urlReader` to the deps and pass it through. Update the `deps` block:

```ts
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        reader: coreServices.urlReader,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, reader, scheduler }) {
```

And update the tenant provider creation call:

```ts
        if (tenantsCfg) {
          const provider = MozcloudTenantEntityProvider.createFromConfig(
            tenantsCfg,
            logger,
            reader,
            scheduler,
          );
          catalog.addEntityProvider(provider);
          logger.info(
            `Registered mozcloud tenant provider (${provider.description})`,
          );
        }
```

(The workgroup provider call is unchanged.)

- [ ] **Step 5: Add the config schema**

In `config.d.ts`, add the `overlay` block inside `tenants` (after the `sources` property, before `schedule`):

```ts
          /**
           * Optional owner-authored overlay. When enabled, the tenant
           * provider fetches a per-tenant catalog-info.yaml and folds it
           * into its full mutation — owners can enrich their generated
           * entities and add new ones scoped to their System.
           */
          overlay?: {
            /** Master switch; overlays are ignored unless `true`. */
            enabled: boolean;
            /** Repo URL template, e.g. `https://github.com/mozilla/{function}-infra`. */
            repoUrlTemplate: string;
            /** Path template within the repo, e.g. `{app_code}/catalog-info.yaml`. */
            pathTemplate: string;
            /** Branch the overlay file lives on. Defaults to `main`. */
            branch?: string;
          };
```

- [ ] **Step 6: Add the app-config example**

In `app-config.yaml`, under `catalog.providers.mozcloud.tenants`, add the `overlay` block (sibling of `sources` and `schedule`):

```yaml
        tenants:
          overlay:
            enabled: true
            repoUrlTemplate: "https://github.com/mozilla/{function}-infra"
            pathTemplate: "{app_code}/catalog-info.yaml"
            branch: main
          sources:
            # ... existing sources unchanged ...
```

- [ ] **Step 7: Run the full package test suite**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package test --no-watch`
Expected: PASS — all existing tests plus the three new overlay test files and the new provider test.

- [ ] **Step 8: Type-check / lint the package**

Run: `cd plugins/catalog-backend-module-mozcloud && yarn backstage-cli package lint && yarn tsc --noEmit -p ../../tsconfig.json`
Expected: no type errors in the module. (If the repo lint command differs, use `yarn lint` from the package.)

- [ ] **Step 9: Commit**

```bash
git add plugins/catalog-backend-module-mozcloud/src/MozcloudTenantEntityProvider.ts \
        plugins/catalog-backend-module-mozcloud/src/MozcloudTenantEntityProvider.test.ts \
        plugins/catalog-backend-module-mozcloud/src/module.ts \
        plugins/catalog-backend-module-mozcloud/config.d.ts \
        app-config.yaml
git commit -m "feat(overlay): wire per-tenant overlays into the tenant provider"
```

---

## Self-Review

**Spec coverage:**
- "Add new entities" → Task 2 `stampNewEntity` + Task 4 provider test (new API). ✓
- "Enrich/override generated entities" → Task 2 `mergeEntity` (scalar override, annotation deep-merge). ✓
- File location & templated config → Task 3 `overlayUrl`/`readOverlayConfig`, Task 4 config.d.ts + app-config. ✓
- UrlReader fetch, 404 = no-op → Task 3 `fetchTenantOverlay`. ✓
- Full override / last-writer-wins, scalars + maps → Task 2 `mergeEntity`/`deepMergeMaps`. ✓
- tags/links append+dedup → Task 2 `unionTags`/`unionLinks` + test. ✓
- Tenant scope guard (cross-tenant ignored+logged) → Task 2 `belongsToTenant` + test. ✓
- New-entity stamping (system forced, owner default) → Task 2 `stampNewEntity` + tests. ✓
- Per-tenant failure isolation → Task 4 `applyOverlays` try/catch. ✓
- Per-document validation + multi-doc + malformed→skip → Task 1 `parseOverlay`/`isEntity`. ✓
- Code structure (overlay/ dir, provider/config/module changes) → Tasks 1–4. ✓
- Testing list → covered across all four task test files. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `OverlayConfig`, `TenantScope`, `entityRef`, `mergeOverlayEntities`, `fetchTenantOverlay`, `readOverlayConfig`, `parseOverlay` names and signatures match between their defining task's Produces block and their consumers in Task 4. `createFromConfig` param order (`config, logger, reader, scheduler`) matches the Task 4 module call. Constructor trailing optional params keep the existing 4-arg tests valid. ✓
