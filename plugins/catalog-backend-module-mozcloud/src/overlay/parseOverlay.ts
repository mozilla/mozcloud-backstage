import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { loadAll } from 'js-yaml';

/**
 * Type guard for the minimum shape Backstage requires to identify an
 * entity: `apiVersion`, `kind`, and `metadata.name` must all be strings.
 * Looser than full catalog validation on purpose — the catalog engine
 * does the rigorous validation when the mutation is applied; this only
 * filters out obvious non-entities (scalars, partial docs) so they never
 * reach the merge step.
 */
export function isEntity(value: unknown): value is Entity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const metadata = v.metadata as Record<string, unknown> | undefined;
  return (
    typeof v.apiVersion === 'string' &&
    typeof v.kind === 'string' &&
    !!metadata &&
    typeof metadata === 'object' &&
    typeof metadata.name === 'string'
  );
}

/**
 * Parse an owner-authored overlay file into Backstage entities.
 *
 * Resilient by design — mirrors the skip-and-log contract of
 * {@link defineBigQuerySource}. A whole-file YAML syntax error logs a
 * warning and yields `[]`; an individual document that is not a valid
 * entity is skipped and logged. Never throws, so one bad overlay can't
 * abort a provider refresh.
 */
export function parseOverlay(
  content: string,
  opts: { description: string; logger: LoggerService },
): Entity[] {
  let docs: unknown[];
  try {
    docs = loadAll(content) as unknown[];
  } catch (error) {
    opts.logger.warn(
      `${opts.description}: failed to parse YAML: ${(error as Error).message}`,
    );
    return [];
  }

  const out: Entity[] = [];
  for (const doc of docs) {
    if (doc === null || doc === undefined) continue; // empty trailing doc
    if (!isEntity(doc)) {
      opts.logger.warn(
        `${opts.description}: skipping document that is not a valid entity`,
      );
      continue;
    }
    out.push(doc);
  }
  return out;
}
