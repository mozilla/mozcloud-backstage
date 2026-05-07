import { LoggerService } from '@backstage/backend-plugin-api';
import { BigQuery } from '@google-cloud/bigquery';
import { ZodType, ZodTypeDef } from 'zod';
import { Source } from './Source';

interface BigQueryConfig {
  project: string;
  dataset: string;
  table: string;
}

/**
 * Reads rows from `<project>.<dataset>.<table>`. Auth follows the standard
 * Google Cloud client conventions: Workload Identity in GKE, Application
 * Default Credentials locally.
 *
 * Each row's nested columns may arrive as already-decoded JS objects or
 * as JSON strings depending on how the upstream pipeline writes them — the
 * caller can pre-process via `normalize` before zod validation. Defaults
 * to passing through.
 */
export class BigQuerySource<T> implements Source<T> {
  readonly description: string;

  constructor(
    private readonly cfg: BigQueryConfig,
    private readonly schema: ZodType<T, ZodTypeDef, unknown>,
    private readonly logger: LoggerService,
    private readonly normalize: (row: Record<string, unknown>) => unknown = r =>
      r,
    private readonly bq: BigQuery = new BigQuery({ projectId: cfg.project }),
  ) {
    this.description = `bigquery:${cfg.project}.${cfg.dataset}.${cfg.table}`;
  }

  async fetchAll(): Promise<T[]> {
    const sql = `SELECT * FROM \`${this.cfg.project}.${this.cfg.dataset}.${this.cfg.table}\``;
    const [rows] = await this.bq.query({ query: sql });
    const out: T[] = [];

    for (const row of rows) {
      try {
        out.push(this.schema.parse(this.normalize(row)));
      } catch (error) {
        this.logger.warn(`Skipping invalid row: ${(error as Error).message}`);
      }
    }

    return out;
  }
}

/**
 * Normalizer for the tenants table — `globals` and `realms` columns may
 * come back as JSON strings.
 */
export function normalizeTenantRow(row: Record<string, unknown>): unknown {
  return {
    globals: parseMaybeJson(row.globals),
    realms: parseMaybeJson(row.realms),
    tenant: row.tenant,
  };
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
