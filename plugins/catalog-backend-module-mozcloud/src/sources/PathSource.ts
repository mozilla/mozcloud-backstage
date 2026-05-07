import { LoggerService } from '@backstage/backend-plugin-api';
import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { load } from 'js-yaml';
import { ZodType, ZodTypeDef } from 'zod';
import { Source } from './Source';

/**
 * Reads YAML files from a local filesystem directory and validates each
 * against a Zod schema. Used for development when the developer doesn't
 * have GCP credentials, or as the canonical source for data not yet
 * exported to BigQuery (e.g. workgroups today).
 *
 * Filters to `*.yaml` and `*.yml` only — `schema.json`, `README.md`, and
 * other sidecar files in the directory are ignored.
 */
export class PathSource<T> implements Source<T> {
  readonly description: string;

  constructor(
    private readonly dir: string,
    private readonly schema: ZodType<T, ZodTypeDef, unknown>,
    private readonly logger: LoggerService,
  ) {
    this.description = `path:${dir}`;
  }

  async fetchAll(): Promise<T[]> {
    const absDir = resolve(this.dir);
    const files = (await readdir(absDir)).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml'),
    );
    const rows: T[] = [];

    for (const file of files) {
      const path = resolve(absDir, file);
      try {
        const raw = await readFile(path, 'utf8');
        const parsed = load(raw);
        rows.push(this.schema.parse(parsed));
      } catch (error) {
        this.logger.warn(
          `Skipping invalid file ${file}: ${(error as Error).message}`,
        );
      }
    }

    return rows;
  }
}
