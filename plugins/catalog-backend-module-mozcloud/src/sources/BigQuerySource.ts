import { LoggerService } from '@backstage/backend-plugin-api';
import { BigQuery } from '@google-cloud/bigquery';
import { ZodType, ZodTypeDef } from 'zod';
import { Source } from './Source';

interface DefineBigQuerySourceOptions<T> {
  /** Full SQL to execute, including any JOINs, CTEs, or projections. */
  query: string;
  /** Validated per row; bad rows are skipped and logged. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Stable identifier — used in log lines and as the provider's location key. */
  description: string;
  /**
   * Project the BigQuery client targets. Jobs are created and billed
   * against this project, so the calling identity must hold
   * `bigquery.jobs.create` on it.
   */
  dataProject?: string;
  /**
   * Optional pre-validation hook for BigQuery quirks the schema doesn't
   * handle directly — most commonly converting REPEATED RECORD columns
   * (BigQuery's only way to represent a map) into objects keyed by a
   * `name` field, or JSON-parsing columns the upstream pipeline left as
   * strings. Null-stripping is applied before this hook fires, so the
   * normalize function sees a tree with no `null` values.
   */
  normalize?: (row: Record<string, unknown>) => unknown;
  logger: LoggerService;
  /** Injectable for tests; defaults to a freshly-constructed client. */
  bq?: BigQuery;
}

/**
 * Construct a {@link Source} that reads typed rows from BigQuery.
 *
 * Wraps the concerns every BigQuery-backed source needs in one place:
 *
 * - **Auth/billing** — the BigQuery client uses ADC (Workload Identity
 *   in GKE, application-default credentials locally) and bills jobs to
 *   the `dataProject`.
 * - **Null-strip** — BigQuery returns `null` for missing optional
 *   fields. Zod's `.optional()` permits `undefined` but not `null`, so
 *   every row is passed through a recursive null-strip before
 *   validation.
 * - **Validation** — each row is parsed through the supplied zod schema.
 *   Parse failures log a warning and skip the row; one bad row never
 *   fails the batch.
 *
 * Callers supply `query` (any SQL the executing identity can run) and
 * `schema` (the expected row shape). The two are siblings: when the
 * SQL changes, the schema typically changes with it. Both live in the
 * same call site, not behind layers of abstraction.
 */
export function defineBigQuerySource<T>(
  opts: DefineBigQuerySourceOptions<T>,
): Source<T> {
  const bq =
    opts.bq ??
    new BigQuery({
      projectId: opts.dataProject,
    });

  return {
    description: opts.description,
    async fetchAll(): Promise<T[]> {
      const [rows] = await bq.query({ query: opts.query });
      const out: T[] = [];

      for (const row of rows) {
        try {
          const stripped = stripNulls(row);
          const prepared = opts.normalize
            ? opts.normalize(stripped as Record<string, unknown>)
            : stripped;
          out.push(opts.schema.parse(prepared));
        } catch (error) {
          opts.logger.warn(`Skipping invalid row: ${(error as Error).message}`);
        }
      }

      return out;
    },
  };
}

/**
 * Normalizer for tenant rows.
 *
 * The catalog data model expresses some collections as maps keyed by
 * name (`globals.deployment.charts`, `realms`, chart `images`), but
 * BigQuery has no native map type, so they land as REPEATED RECORDs
 * with the key folded into a `name` column. Rebuild the maps so the
 * zod schema (which mirrors the YAML shape) parses cleanly.
 *
 * Some pipeline versions also write the `globals` and `realms` columns
 * as JSON strings rather than nested STRUCTs; JSON-parse them when
 * that's the case.
 *
 * Null-stripping is performed by {@link defineBigQuerySource} before
 * this function is called, so we don't repeat it here.
 */
export function normalizeTenantRow(row: Record<string, unknown>): unknown {
  return arrayToMapByName(
    {
      globals: parseMaybeJson(row.globals),
      realms: parseMaybeJson(row.realms),
      tenant: row.tenant,
    },
    [['realms'], ['globals', 'deployment', 'charts']],
  );
}

/**
 * Convert any "array of {name, ...}" found at the given nested paths
 * into "object keyed by name". Idempotent — already-object values are
 * left alone. Also walks chart-level `images` arrays after the parent
 * `charts` array has been converted to a map.
 */
function arrayToMapByName(
  root: Record<string, unknown>,
  paths: string[][],
): Record<string, unknown> {
  for (const path of paths) {
    convertAtPath(root, path);
  }
  const charts = (
    (root.globals as Record<string, unknown> | undefined)?.deployment as
      | Record<string, unknown>
      | undefined
  )?.charts as Record<string, Record<string, unknown>> | undefined;
  if (charts && typeof charts === 'object') {
    for (const chart of Object.values(charts)) {
      convertAtPath(chart, ['images']);
    }
  }
  return root;
}

function convertAtPath(
  obj: Record<string, unknown> | undefined,
  path: string[],
): void {
  if (!obj) return;
  let cur: Record<string, unknown> | undefined = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const next = cur?.[path[i]];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  const leaf = path[path.length - 1];
  const value = cur?.[leaf];
  if (!Array.isArray(value)) return;
  const out: Record<string, unknown> = {};
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const named = item as Record<string, unknown>;
    const name = named.name;
    if (typeof name !== 'string') continue;
    const { name: _, ...rest } = named;
    out[name] = rest;
  }
  if (cur) cur[leaf] = out;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(stripNulls).filter(v => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const stripped = stripNulls(v);
      if (stripped !== undefined) out[k] = stripped;
    }
    return out;
  }
  return value;
}
