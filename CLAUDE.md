# Project instructions

Mozilla's internal [Backstage](https://backstage.io) developer portal. Yarn 4
(berry) monorepo: a frontend app, a backend, and custom plugins.

## Environment

- **Node is pinned to `24.16.0`** (`.nvmrc`). Run `nvm use` first — a
  Homebrew-installed Node (e.g. 25) shadows nvm on PATH and will be picked up
  otherwise. (`package.json` `engines` says `22 || 24`, but use the pinned
  `24.16.0`; `24.17.0` reintroduces a node-fetch premature-close bug that breaks
  gcpIap sign-in.)
- Package manager: **yarn 4.4.1**. Backstage version: see `backstage.json`.
- Local dev backends: `docker compose up` (postgres + redis). Copy `.env.sample`
  to `.env` for connection vars. See `README.md`.

## Common commands

Run from the repo root unless noted:

- `yarn start` — run app + backend (`backstage-cli repo start`).
- `yarn test` / `yarn test:all` — repo tests (`test:all` adds coverage, runs
  once). For a single package, `cd` into it and use
  `yarn backstage-cli package test --no-watch` — **always pass `--no-watch`**,
  the default watch mode hangs non-interactive sessions.
- `yarn lint` (changed vs `origin/main`) / `yarn lint:all`.
- `yarn tsc` — type-check. The authoritative full check is
  `yarn tsc:full` (`--skipLibCheck false --incremental false`); a stale
  `dist-types/tsconfig.tsbuildinfo` can mask errors on incremental runs, and
  Jest transpiles without type-checking, so type errors slip past green tests.
- `yarn fix` — apply automated lint/format fixes.

## Before committing

Always run `yarn prettier:check` before committing. If it reports unformatted
files, run `yarn prettier --write <files>` (or `yarn fix`) until the check
passes, then commit. Do not commit code that fails the Prettier check.

Note: `lint-staged` is configured in `package.json` but **no git pre-commit hook
is installed** (no husky), so formatting is **not** enforced automatically —
the check above is manual.

## Layout

- `packages/app` — frontend (React).
- `packages/backend` — backend; plugins are wired in `src/index.ts`.
- `plugins/catalog-backend-module-mozcloud` — custom catalog ingestion (see
  below).
- `plugins/glean` — Glean plugin.
- `scaffolder-templates/` — software templates.
- Releases are automated via **release-please** (`.github` workflow +
  `release-please-config.json`).

## Catalog architecture

The catalog is built **entirely from BigQuery** (`mozdata.mozcloud`) by custom
`EntityProvider`s in `plugins/catalog-backend-module-mozcloud`, not from
`catalog-info.yaml` discovery. Each provider emits a **full mutation** per
refresh, so the catalog engine prunes removed entities automatically.

- `MozcloudTenantEntityProvider` → Domain / System / Resource / Component
  entities from the `tenants` tables.
- `MozcloudWorkgroupEntityProvider` → Group / User entities (namespace
  `workgroups`) from the `workgroups` tables.

**Terminology gap** (matters when reading code vs. talking to service owners):

| Owner term    | Backstage / pipeline term           |
| ------------- | ----------------------------------- |
| service / app | **System** (a "tenant" in BigQuery) |
| team          | **Group** (a "workgroup")           |
| deployment    | **Component**                       |
| GCP project   | **Resource** (`gcp-project`)        |

Owner-authored `catalog-info.yaml` overlays (enrich/add to a tenant's entities)
are designed in `docs/superpowers/specs/2026-06-23-tenant-catalog-overlays-design.md`.
