# Owner-authored catalog overlays for Mozcloud tenants

**Date:** 2026-06-23
**Status:** Approved design — pending implementation plan

## Problem

The Backstage catalog is built entirely from BigQuery-backed `EntityProvider`s
(`MozcloudTenantEntityProvider`, `MozcloudWorkgroupEntityProvider`) that emit
**full mutations** — each refresh replaces all entities the provider owns. This
gives a consistent, automatically-pruned catalog, but leaves no way for entity
owners to customize their entities.

Tenant owners (e.g. the Merino service team) need to:

1. **Add** new entities they own — API entities, additional Components,
   Resources, docs — that belong to their tenant's System.
2. **Enrich / override** the auto-generated System and Component entities with
   extra descriptions, annotations, links, and tags.

Backstage natively gives each entity exactly one owning location/provider and
will not merge two entities that share the same entity ref. So a second
ingestion path (e.g. native GitHub discovery) cannot satisfy the "enrich" need —
two entities with the same ref collide. The merge must happen inside the
provider that already owns those refs.

## Approach

Extend `MozcloudTenantEntityProvider`. During each refresh, after building
entities from BigQuery, the provider also fetches a per-tenant
`catalog-info.yaml` overlay file and folds its contents into the **same full
mutation** it already emits. One provider, one mutation, no ref collisions, no
second ingestion path.

This was chosen over:

- **Pure native GitHub discovery** — cannot enrich (ref collisions); additive
  only, which was explicitly ruled out.
- **Hybrid (provider overlay + native discovery for app-repo adds)** — viable
  later, but adds a second ingestion path to maintain. The door stays open: a
  future iteration can enable `catalog-backend-module-github` discovery for
  app-repo `catalog-info.yaml` files that additively declare new entities. Out
  of scope for this design.

## File location & convention

- Path: `mozilla/{function}-infra/{app_code}/catalog-info.yaml`.
- Deterministic — the provider already knows `function` and `app_code` for each
  tenant from BigQuery, so it constructs the exact URL. No repo crawling.
- Configurable via templated strings in `app-config.yaml` under
  `catalog.providers.mozcloud.tenants.overlay`:

  ```yaml
  catalog:
    providers:
      mozcloud:
        tenants:
          overlay:
            enabled: true
            repoUrlTemplate: 'https://github.com/mozilla/{function}-infra'
            pathTemplate: '{app_code}/catalog-info.yaml'
            branch: main
  ```

- Fetched with the backend `UrlReaderService`, which uses the existing GitHub
  integration credentials. A missing file (`404` / `NotFoundError`) is a normal
  no-op — most tenants will not have an overlay.

## Merge semantics

Full override, last-writer-wins, **scoped to the tenant**.

For each entity document in the overlay file:

1. **Match by entity ref** (`kind:namespace/name`, lowercased). If the ref
   matches an entity already generated for this tenant → **override**.
   Otherwise → **new entity**.

2. **Tenant scope guard.** An override target must belong to _this_ tenant
   (its `app_code` / System). A file at `{app_code}/` may only touch
   entities of that tenant. Cross-tenant or unknown override targets are
   **ignored and logged at `warn`**. New entities are auto-stamped:

   - `spec.system = {app_code}` (forced — a new entity always joins this
     tenant's System);
   - `spec.owner` defaults to the tenant's primary workgroup if unset.

3. **Field merge rule (override targets):**
   - **Scalars** (e.g. `metadata.description`, `spec.lifecycle`): overlay value
     wins.
   - **Maps / objects** (e.g. `metadata.annotations`): deep-merge; overlay keys
     win on conflict, non-conflicting generated keys are preserved.
   - **Arrays** `metadata.tags` and `metadata.links`: **append + dedup** —
     overlay values are added to the generated values (deduped), not replaced.
     This is the one deliberate exception to strict last-writer-wins, chosen
     because "add a link/tag" is the common owner intent.
   - Identity fields (`kind`, `metadata.name`, `metadata.namespace`) define the
     match key and are therefore not themselves overridable to a different
     value.

The merged/added entities are appended to the provider's existing entity set
**before** its current dedup step, then emitted in the single full mutation.

## Failure isolation & validation

- **Per-tenant isolation.** Each tenant's overlay fetch + parse + merge is
  wrapped in `try/catch`. A failure (network, malformed YAML, invalid entity)
  skips only that tenant's overlay and logs; it never aborts the refresh or
  drops the BigQuery-generated entities.
- **Per-document validation.** Each YAML document is validated as a Backstage
  entity (requires `apiVersion`, `kind`, `metadata.name`). Invalid documents are
  skipped and logged, mirroring the existing `BigQuerySource` skip-on-error
  pattern.
- **Multi-document YAML** (`---` separated) is supported.

## Code structure

Fits the existing module layout under
`plugins/catalog-backend-module-mozcloud/src/`:

- `overlay/fetchTenantOverlay.ts` — resolve path/repo templates, read via
  `UrlReaderService`, return raw content or `undefined` on `404`.
- `overlay/parseOverlay.ts` — parse multi-doc YAML, validate each as an entity,
  skip+log invalid docs.
- `overlay/mergeOverlay.ts` — ref-match against generated entities, apply tenant
  scope guard, deep-merge / append-dedup, stamp new entities.
- `MozcloudTenantEntityProvider.ts` — in `refresh()`, after
  `tenantToEntities` / `chartToEntities` and before the existing dedup + full
  mutation, fetch and merge overlays per tenant.
- `config.d.ts` — add the `overlay` config block.
- `module.ts` — pass `UrlReaderService` and overlay config into the provider.

## Testing

Unit tests, run with `backstage-cli package test --no-watch`:

- `mergeOverlay`:
  - scalar override wins; `spec.lifecycle` overrides.
  - `metadata.annotations` deep-merge (overlay key wins, generated keys kept).
  - `metadata.tags` / `metadata.links` append + dedup (not replaced).
  - cross-tenant / unknown override target is rejected + logged, generated
    entity unchanged.
  - new entity is stamped with `spec.system = app_code` and default owner.
- `fetchTenantOverlay`: `404` → `undefined` (no-op); successful read returns
  content.
- `parseOverlay`: malformed YAML → skipped; multi-doc parsed; invalid entity
  doc skipped + logged.

## Follow-up: scaffolder template for overlays

After the provider-side overlay ingestion ships, add a Backstage software
template that lets owners create or seed an overlay file through the UI instead
of hand-authoring YAML and opening a PR manually. Tracked as a separate
spec → plan → implementation cycle, not part of this design.

Sketch:

- New template under `scaffolder-templates/create-tenant-overlay/`
  (`template.yaml` + a `skeleton/catalog-info.yaml.njk`), following the existing
  `create-rfc` template structure.
- Parameters: target tenant (`app_code` / `function`, ideally an entity picker
  over existing Systems), and the kind of addition (e.g. enrich the System,
  add an API entity, add a Component).
- Action: render the skeleton to
  `{app_code}/catalog-info.yaml` in `{function}-infra` and open a PR via
  the GitHub scaffolder actions (`publish:github:pull-request`), matching the
  overlay path convention this design establishes.
- Prerequisite: the scaffolder template location in `app-config.yaml` is
  currently commented out (`catalog.locations` → `scaffolder-templates/*/template.yaml`)
  and would need enabling.

## Out of scope

- Overlays for workgroups / users (`MozcloudWorkgroupEntityProvider`).
- Native GitHub discovery of app-repo `catalog-info.yaml` files (possible future
  hybrid).
- A UI for authoring or previewing overlays (covered by the scaffolder template
  follow-up above).
