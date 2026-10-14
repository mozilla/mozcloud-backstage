import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { readFileSync } from 'fs';
import { parse } from 'yaml';

const COPIER_ENVS = ['dev', 'stage', 'prod'];

export interface TenantContext {
  function: string;
  environments: string[];
}

/**
 * Parse a tenant YAML and extract its function and the unique set of realm
 * environment names (e.g. `dev`, `stage`, `prod`).
 */
export function parseTenantContext(yamlText: string): TenantContext {
  const doc = parse(yamlText) as any;
  const fn = doc?.globals?.function;
  if (!fn) {
    throw new Error('tenant yaml missing globals.function');
  }

  const envs = new Set<string>();
  for (const realm of Object.values(doc?.realms ?? {}) as any[]) {
    for (const env of realm?.environments ?? []) {
      if (env?.name) {
        envs.add(env.name);
      }
    }
  }

  return { function: fn, environments: [...envs] };
}

/**
 * Restrict a tenant's environment names to the ones copier's chart mode knows
 * (`dev`/`stage`/`prod`). Falls back to all three when the tenant has none of
 * them (e.g. only a `test` env), so the render still produces values files.
 */
export function computeCopierEnvironments(environments: string[]): string[] {
  const matched = environments.filter(env => COPIER_ENVS.includes(env));
  return matched.length ? matched : COPIER_ENVS;
}

export function createReadTenantAction() {
  return createTemplateAction({
    id: 'mozcloud:tenant:read',
    description:
      'Read a tenant YAML and output its function, environments, and copier-compatible environments.',
    schema: {
      input: {
        tenantYamlPath: z =>
          z
            .string()
            .describe(
              'Path to the tenant YAML file, relative to the workspace',
            ),
      },
      output: {
        function: z => z.string().describe('The tenant function'),
        environments: z =>
          z.array(z.string()).describe('Unique realm environment names'),
        copierEnvironments: z =>
          z
            .array(z.string())
            .describe(
              'Environments restricted to dev/stage/prod (falls back to all three if none match)',
            ),
      },
    },
    async handler(ctx) {
      const abs = resolveSafeChildPath(
        ctx.workspacePath,
        ctx.input.tenantYamlPath,
      );
      const parsed = parseTenantContext(readFileSync(abs, 'utf8'));

      ctx.output('function', parsed.function);
      ctx.output('environments', parsed.environments);
      ctx.output(
        'copierEnvironments',
        computeCopierEnvironments(parsed.environments),
      );
    },
  });
}
