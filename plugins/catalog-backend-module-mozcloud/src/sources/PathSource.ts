import { LoggerService } from '@backstage/backend-plugin-api';
import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { load } from 'js-yaml';
import { TenantRow, TenantRowSchema } from '../transform/schema';
import { Source } from './Source';

/**
 * Reads tenant YAMLs from a local filesystem directory. Used for
 * development when the developer doesn't have GCP credentials.
 *
 * Filters to `*.yaml` only — `schema.json`, `README.md`, and other
 * sidecar files in the directory are ignored.
 */
export class PathSource implements Source {
  readonly description: string;

  constructor(
    private readonly dir: string,
    private readonly logger: LoggerService,
  ) {
    this.description = `path:${dir}`;
  }

  async fetchAll(): Promise<TenantRow[]> {
    const absDir = resolve(this.dir);
    const files = (await readdir(absDir)).filter(f => f.endsWith('.yaml'));
    const rows: TenantRow[] = [];

    for (const file of files) {
      const path = resolve(absDir, file);
      try {
        const raw = await readFile(path, 'utf8');
        const parsed = load(raw);
        const validated = TenantRowSchema.parse(parsed);
        rows.push(validated);
      } catch (error) {
        this.logger.warn(
          `Skipping invalid tenant file ${file}: ${(error as Error).message}`,
        );
      }
    }

    return rows;
  }
}
