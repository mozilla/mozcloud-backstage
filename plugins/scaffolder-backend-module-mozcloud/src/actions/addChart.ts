import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { readFileSync, writeFileSync } from 'fs';
import { parse, parseDocument, YAMLSeq, YAMLMap } from 'yaml';
import { Environment } from 'nunjucks';

export interface AddChartOptions {
  chartName: string;
  applicationRepository: string;
  imageName: string;
}

// MozCloud paved-path image tag formats (Confluence "Standards: Container
// Images"): main pushes are tagged with a 10-char lowercase-hex short git SHA;
// releases are tagged with a semver git tag (vX.Y.Z).
const SHORT_SHA_REGEX = '^[0-9a-f]{10}$';
const SEMVER_TAG_REGEX = '^v[0-9]+\\.[0-9]+\\.[0-9]+$';

/**
 * ArgoCD Image Updater tag-filter regex for an environment, per the paved-path
 * tagging standard: prod tracks semver release tags; every other environment
 * (dev/stage/…) tracks main-branch short-SHA builds.
 */
export function imageRegexForEnv(envName: string): string {
  return envName === 'prod' ? SEMVER_TAG_REGEX : SHORT_SHA_REGEX;
}

const nunjucksEnv = new Environment(null, { autoescape: false });

/**
 * Render the chart-values template (Nunjucks) into a partial tenant document.
 * The template is authored in the tenant's own schema and loops over the
 * tenant's realms, so the result mirrors what will land in the tenant YAML.
 */
export function renderChartValues(
  template: string,
  vars: Record<string, unknown>,
): string {
  return nunjucksEnv.renderString(template, vars);
}

interface RealmContext {
  name: string;
  environments: { name: string; imageRegex: string }[];
}

/**
 * Read the tenant's realms/environments so the template can be rendered with
 * entries that line up with the tenant, and each environment carries its
 * paved-path image_regex.
 */
function tenantRealmsContext(doc: ReturnType<typeof parseDocument>): {
  realms: RealmContext[];
  indexOf: Map<string, number>;
} {
  const realms: RealmContext[] = [];
  const indexOf = new Map<string, number>();
  const realmsNode = doc.getIn(['realms']) as YAMLMap | undefined;
  for (const realmItem of realmsNode?.items ?? []) {
    const realmName = String((realmItem as any).key);
    const envsNode = doc.getIn(['realms', realmName, 'environments']) as
      | YAMLSeq
      | undefined;
    const environments = (envsNode?.items ?? []).map((env, i) => {
      const envName = String((env as YAMLMap).get('name'));
      indexOf.set(`${realmName}/${envName}`, i);
      return { name: envName, imageRegex: imageRegexForEnv(envName) };
    });
    realms.push({ name: realmName, environments });
  }
  return { realms, indexOf };
}

/**
 * Merge a new chart into a tenant YAML, preserving comments/formatting (eemeli
 * `yaml` Document round-trip). The chart structure comes entirely from
 * rendering `valuesTemplate` (the `chart-values.yaml` that ships with the
 * template) — authored in the tenant schema — against the tenant's realms; this
 * code only drops the rendered entries onto the matching paths. Overwrites an
 * existing entry of the same name (safe to re-run).
 */
export function mergeChartIntoTenantYaml(
  yamlText: string,
  opts: AddChartOptions,
  valuesTemplate: string,
): string {
  const { chartName, applicationRepository, imageName } = opts;
  const doc = parseDocument(yamlText);
  const { realms, indexOf } = tenantRealmsContext(doc);

  const rendered = (parse(
    renderChartValues(valuesTemplate, {
      chartName,
      imageName,
      applicationRepository,
      realms,
    }),
  ) ?? {}) as any;

  const globalsEntry = rendered.globals?.deployment?.charts?.[chartName];
  if (globalsEntry !== undefined) {
    doc.setIn(['globals', 'deployment', 'charts', chartName], globalsEntry);
  }

  for (const [realmName, realm] of Object.entries<any>(rendered.realms ?? {})) {
    for (const env of realm?.environments ?? []) {
      const i = indexOf.get(`${realmName}/${env.name}`);
      if (i === undefined) continue;
      doc.setIn(
        ['realms', realmName, 'environments', i, 'charts', chartName],
        env.charts?.[chartName],
      );
    }
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
        valuesTemplatePath: z =>
          z
            .string()
            .describe(
              'Path (relative to the workspace) to the chart-values.yaml template defining the static chart shape',
            ),
      },
    },
    async handler(ctx) {
      const {
        tenantYamlPath,
        chartName,
        applicationRepository,
        imageName,
        valuesTemplatePath,
      } = ctx.input;
      const abs = resolveSafeChildPath(ctx.workspacePath, tenantYamlPath);
      const tplAbs = resolveSafeChildPath(
        ctx.workspacePath,
        valuesTemplatePath,
      );
      const merged = mergeChartIntoTenantYaml(
        readFileSync(abs, 'utf8'),
        {
          chartName,
          applicationRepository,
          imageName: imageName || chartName,
        },
        readFileSync(tplAbs, 'utf8'),
      );
      writeFileSync(abs, merged, 'utf8');
      ctx.logger.info(`Added chart '${chartName}' to ${tenantYamlPath}`);
    },
  });
}
