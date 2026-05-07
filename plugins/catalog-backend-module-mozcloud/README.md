# `@internal/plugin-catalog-backend-module-mozcloud`

Catalog backend module that syncs Mozilla GCP **tenants** (and, eventually,
**workgroups**) into the Backstage catalog as Systems, Components, Resources,
and Groups.

The source of truth is the YAML in
[`mozilla-services/global-platform-admin`](https://github.com/mozilla-services/global-platform-admin)
under `tenants/`. That repo's CI exports each merged tenant row to
`mozdata.mozcloud.tenants`, which is what this provider reads in production.
For local development the provider can read the YAML files directly from a
sibling checkout instead.

## Entity mapping

For each tenant row:

| Source field                                     | Backstage entity | Notes                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `globals.app_code`                               | `System`         | `spec.owner = group:workgroups/<first_workgroup>`, `spec.domain = function`, tags `[function, risk-<level>]`, annotations for risk/function/cluster_type/slack_channel                                                                                          |
| `globals.deployment.charts.<name>`               | `Component`      | `spec.system = app_code`, `type = service`, `lifecycle = production`. Single-chart tenants use `app_code` as the component name; multi-chart tenants get `${app_code}-${chart_name}`. `github.com/project-slug` annotation comes from `application_repository`. |
| `realms.<realm>.project_id`                      | `Resource`       | `spec.type = gcp-project`, annotations record realm + environments                                                                                                                                                                                              |
| `globals.entitlements.additional_entitlements[]` | `Resource`       | `spec.type = gcp-entitlement`, `dependsOn` resolves principals like `workgroup:fxa/developers` to `group:workgroups/fxa-developers`                                                                                                                             |
| `globals.workgroups[]`                           | `Group` (shell)  | namespace `workgroups`. Just a name — no member or sponsor data yet (those come in v2 from the dedicated workgroups table). Deduplicated across tenants.                                                                                                        |

The `workgroups` namespace keeps these Groups from colliding with the
GitHub Org provider's Groups (`group:default/mozilla-services` and
friends). User identity stays with the GitHub Org provider; mozilla.com
emails are not emitted as User entities until v2.

## Configuration

```yaml
catalog:
  providers:
    mozcloud:
      tenants:
        # Pick exactly one of bigquery or path:
        bigquery:
          project: mozdata
          dataset: mozcloud
          table: tenants
        # path: ../../../global-platform-admin/tenants  # local dev only
        schedule:
          frequency: { minutes: 30 }
          timeout: { minutes: 5 }
          initialDelay: { seconds: 30 }
      # workgroups: { ... }   # reserved for v2; the provider is wired
      # but logs a warning until the
      # mozcloud.workgroups table exists.
```

`bigquery` and `path` are mutually exclusive — set exactly one. If neither is
present the module logs `mozcloud provider not configured` and stays inert,
so it's safe to omit the entire block in environments where you don't want
the integration.

### Local development

```sh
git clone git@github.com:mozilla-services/global-platform-admin.git \
  ../global-platform-admin
# in app-config.yaml under catalog.providers.mozcloud.tenants:
#   path: ../../../global-platform-admin/tenants
yarn start
```

The path is resolved relative to the backend's CWD (`packages/backend/`),
which is why it walks up three levels. The first run fires after the
configured `initialDelay`; subsequent runs follow the `frequency` schedule.

### Production (Workload Identity)

The Backstage backend service account needs:

- `roles/bigquery.dataViewer` on `mozdata.mozcloud` (read the table)
- `roles/bigquery.jobUser` on the project that runs the backend (run query jobs)

Verify locally with:

```sh
gcloud auth application-default login
bq query --project_id=mozdata --use_legacy_sql=false \
  'SELECT COUNT(*) FROM `mozdata.mozcloud.tenants`'
```

## Refresh semantics

Each scheduled run reads the entire source and applies a single
`type: 'full'` mutation to the catalog. Tenants removed upstream (deleted
YAML or row) disappear from the catalog on the next tick automatically —
no delta logic needed.

A bad row (fails the zod schema) is logged and skipped; the rest of the
batch still applies. This keeps one malformed tenant from blanking the
catalog.

## Layout

```
src/
├── index.ts                            re-exports module + transform
├── module.ts                           createBackendModule, wires providers
├── MozcloudTenantEntityProvider.ts     EntityProvider, runs the source +
│                                       transform on the schedule
├── MozcloudWorkgroupEntityProvider.ts  v2 placeholder
├── sources/                            pluggable data sources
│   ├── Source.ts                       common interface
│   ├── BigQuerySource.ts               mozdata.mozcloud.<table>
│   ├── PathSource.ts                   filesystem YAML reader
│   └── createSource.ts                 config-driven factory
├── transform/                          pure functions, fully testable
│   ├── schema.ts                       zod TenantRowSchema
│   ├── refs.ts                         workgroupRef, owner helpers
│   └── tenantToEntities.ts             TenantRow -> Entity[]
└── __fixtures__/                       real tenants for tests
```
