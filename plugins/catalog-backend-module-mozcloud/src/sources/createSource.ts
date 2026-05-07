import { LoggerService } from '@backstage/backend-plugin-api';
import { BigQuerySource } from './BigQuerySource';
import { PathSource } from './PathSource';
import { Source } from './Source';

interface SourceConfig {
  bigquery?: { project: string; dataset: string; table: string };
  path?: string;
}

/**
 * Build the right Source from config. Exactly one of `bigquery` or `path`
 * must be set; both or neither is a configuration error.
 */
export function createSource(
  config: SourceConfig,
  logger: LoggerService,
): Source {
  const hasBq = Boolean(config.bigquery);
  const hasPath = Boolean(config.path);
  if (hasBq && hasPath) {
    throw new Error(
      'mozcloud source must specify exactly one of `bigquery` or `path`',
    );
  }
  if (config.bigquery) {
    return new BigQuerySource(config.bigquery, logger);
  }
  if (config.path) {
    return new PathSource(config.path, logger);
  }
  throw new Error(
    'mozcloud source requires either `bigquery` or `path` to be set',
  );
}
