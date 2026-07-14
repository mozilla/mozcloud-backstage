import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { readFileSync, writeFileSync } from 'fs';
import { parseDocument, YAMLSeq, YAMLMap } from 'yaml';

export interface AddChartOptions {
  chartName: string;
  applicationRepository: string;
  imageName: string;
}

/**
 * Merge a new chart into a tenant YAML, preserving comments/formatting (eemeli
 * `yaml` Document round-trip). Adds `globals.deployment.charts.<name>` and a
 * `charts.<name>` entry under every realm environment. Overwrites an existing
 * entry of the same name (safe to re-run).
 */
export function mergeChartIntoTenantYaml(
  yamlText: string,
  opts: AddChartOptions,
): string {
  const { chartName, applicationRepository, imageName } = opts;
  const doc = parseDocument(yamlText);

  doc.setIn(['globals', 'deployment', 'charts', chartName], {
    application_repository: applicationRepository,
    images: {
      [imageName]: {
        auto_update: true,
        image_name: 'image.repository',
        image_tag: 'image.tag',
      },
    },
  });

  const realms = doc.getIn(['realms']) as YAMLMap | undefined;
  for (const realmItem of realms?.items ?? []) {
    const realmName = String((realmItem as any).key);
    const envs = doc.getIn(['realms', realmName, 'environments']) as
      | YAMLSeq
      | undefined;
    envs?.items.forEach((env, i) => {
      const envName = String((env as YAMLMap).get('name'));
      doc.setIn(['realms', realmName, 'environments', i, 'charts', chartName], {
        release_name: chartName,
        images: {
          [imageName]: { image_regex: `^${envName}-.{40}$` },
        },
      });
    });
  }
  return doc.toString();
}

export function createAddChartAction() {
  return createTemplateAction({
    id: 'mozcloud:tenant:add-chart',
    description:
      'Merge a new chart into a tenant YAML (globals + per-env), preserving comments.',
    schema: {
      input: {
        tenantYamlPath: z =>
          z
            .string()
            .describe(
              'Path to the tenant YAML file, relative to the workspace',
            ),
        chartName: z => z.string().describe('Name of the chart to add'),
        applicationRepository: z =>
          z.string().describe('Application repository, e.g. mozilla/widget'),
        imageName: z =>
          z
            .string()
            .describe('Image name key (defaults to chartName)')
            .optional(),
      },
    },
    async handler(ctx) {
      const { tenantYamlPath, chartName, applicationRepository, imageName } =
        ctx.input;
      const abs = resolveSafeChildPath(ctx.workspacePath, tenantYamlPath);
      const merged = mergeChartIntoTenantYaml(readFileSync(abs, 'utf8'), {
        chartName,
        applicationRepository,
        imageName: imageName || chartName,
      });
      writeFileSync(abs, merged, 'utf8');
      ctx.logger.info(`Added chart '${chartName}' to ${tenantYamlPath}`);
    },
  });
}
