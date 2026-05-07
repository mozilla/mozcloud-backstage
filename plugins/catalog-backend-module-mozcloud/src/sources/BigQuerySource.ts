import { LoggerService } from '@backstage/backend-plugin-api';
import { BigQuery } from '@google-cloud/bigquery';
import { TenantRow, TenantRowSchema } from '../transform/schema';
import { Source } from './Source';

interface BigQueryConfig {
  project: string;
  dataset: string;
  table: string;
}

/**
 * Reads tenant rows from `<project>.<dataset>.<table>` (typically
 * `mozdata.mozcloud.tenants`). Auth follows the standard Google Cloud
 * client conventions: Workload Identity in GKE, Application Default
 * Credentials locally.
 *
 * Each BigQuery row's `globals` and `realms` columns may arrive as
 * already-decoded JS objects or as JSON strings depending on how the
 * upstream pipeline writes them — we normalize both before handing
 * the row to the zod validator.
 */
export class BigQuerySource implements Source {
  readonly description: string;

  constructor(
    private readonly cfg: BigQueryConfig,
    private readonly logger: LoggerService,
    private readonly bq: BigQuery = new BigQuery({ projectId: cfg.project }),
  ) {
    this.description = `bigquery:${cfg.project}.${cfg.dataset}.${cfg.table}`;
  }

  async fetchAll(): Promise<TenantRow[]> {
    const sql = `SELECT * FROM \`${this.cfg.project}.${this.cfg.dataset}.${this.cfg.table}\``;
    const [rows] = await this.bq.query({ query: sql });
    const out: TenantRow[] = [];

    for (const row of rows) {
      try {
        const normalized = {
          globals: parseMaybeJson(row.globals),
          realms: parseMaybeJson(row.realms),
          tenant: row.tenant,
        };
        out.push(TenantRowSchema.parse(normalized));
      } catch (error) {
        this.logger.warn(
          `Skipping invalid tenant row (app_code=${
            (row.globals as { app_code?: string })?.app_code ?? '?'
          }): ${(error as Error).message}`,
        );
      }
    }

    return out;
  }
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
