import { LoggerService } from '@backstage/backend-plugin-api';
import { ZodType, ZodTypeDef } from 'zod';
import { BigQuerySource } from './BigQuerySource';
import { PathSource } from './PathSource';
import { Source } from './Source';

interface SourceConfig {
  bigquery?: { project: string; dataset: string; table: string };
  path?: string;
}

/**
 * Build the right Source from config. Exactly one of `bigquery` or `path`
 * must be set. The schema's input type is intentionally `unknown` so that
 * Zod schemas using `.default()` (where input ≠ output) compose cleanly.
 */
export function createSource<T>(
  config: SourceConfig,
  schema: ZodType<T, ZodTypeDef, unknown>,
  logger: LoggerService,
  bqNormalize?: (row: Record<string, unknown>) => unknown,
): Source<T> {
  const hasBq = Boolean(config.bigquery);
  const hasPath = Boolean(config.path);
  if (hasBq && hasPath) {
    throw new Error(
      'mozcloud source must specify exactly one of `bigquery` or `path`',
    );
  }
  if (config.bigquery) {
    return new BigQuerySource(config.bigquery, schema, logger, bqNormalize);
  }
  if (config.path) {
    return new PathSource(config.path, schema, logger);
  }
  throw new Error(
    'mozcloud source requires either `bigquery` or `path` to be set',
  );
}
