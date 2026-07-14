import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDocument } from 'yaml';
import {
  imageRegexForEnv,
  mergeChartIntoTenantYaml,
  renderChartValues,
} from './addChart';

describe('imageRegexForEnv', () => {
  it('uses the semver release-tag regex for prod', () => {
    expect(imageRegexForEnv('prod')).toBe('^v[0-9]+\\.[0-9]+\\.[0-9]+$');
  });

  it('uses the 10-char short-SHA regex for non-prod envs', () => {
    expect(imageRegexForEnv('dev')).toBe('^[0-9a-f]{10}$');
    expect(imageRegexForEnv('stage')).toBe('^[0-9a-f]{10}$');
    expect(imageRegexForEnv('anything-else')).toBe('^[0-9a-f]{10}$');
  });
});

describe('renderChartValues', () => {
  it('substitutes {{ var }} placeholders (Nunjucks)', () => {
    expect(renderChartValues('name: {{ chartName }}', { chartName: 'w' })).toBe(
      'name: w',
    );
  });

  it('does not HTML-escape values (autoescape off)', () => {
    expect(renderChartValues('r: {{ v }}', { v: '^v[0-9]+$' })).toBe(
      'r: ^v[0-9]+$',
    );
  });

  it('expands loops over the realms context', () => {
    const out = renderChartValues(
      '{% for r in realms %}{{ r.name }},{% endfor %}',
      { realms: [{ name: 'nonprod' }, { name: 'prod' }] },
    );
    expect(out).toBe('nonprod,prod,');
  });
});

const fixture = () =>
  readFileSync(resolve(__dirname, '../__fixtures__/tenant.yaml'), 'utf8');

const chartValuesTemplate = () =>
  readFileSync(
    resolve(
      __dirname,
      '../../../../scaffolder-templates/create-tenant-chart/chart-values.yaml.njk',
    ),
    'utf8',
  );

const opts = {
  chartName: 'widget',
  applicationRepository: 'mozilla/widget',
  imageName: 'widget',
};

// The real template shipped beside the scaffolder template.
const valuesTemplate = chartValuesTemplate();

describe('mergeChartIntoTenantYaml', () => {
  it('adds the chart under globals.deployment.charts with derived image mapping', () => {
    const doc = parseDocument(
      mergeChartIntoTenantYaml(fixture(), opts, valuesTemplate),
    );
    expect(
      doc.getIn([
        'globals',
        'deployment',
        'charts',
        'widget',
        'application_repository',
      ]),
    ).toBe('mozilla/widget');
    expect(
      doc.getIn([
        'globals',
        'deployment',
        'charts',
        'widget',
        'images',
        'widget',
        'image_name',
      ]),
    ).toBe('image.repository');
  });

  it('adds a per-environment charts entry with release_name + paved-path image_regex', () => {
    const out = mergeChartIntoTenantYaml(fixture(), opts, valuesTemplate);
    const doc = parseDocument(out);
    const realms: any = doc.toJS().realms;
    const prodEnv = realms.prod.environments.find(
      (e: any) => e.name === 'prod',
    );
    expect(prodEnv.charts.widget.release_name).toBe('widget');
    // prod tracks semver release tags
    expect(prodEnv.charts.widget.images.widget.image_regex).toBe(
      '^v[0-9]+\\.[0-9]+\\.[0-9]+$',
    );
    // non-prod envs track main-branch 10-char short SHAs
    const byName = (name: string) =>
      realms.nonprod.environments.find((e: any) => e.name === name);
    expect(byName('dev').charts.widget.images.widget.image_regex).toBe(
      '^[0-9a-f]{10}$',
    );
    expect(byName('stage').charts.widget.images.widget.image_regex).toBe(
      '^[0-9a-f]{10}$',
    );
  });

  it('preserves existing comments and the existing chart', () => {
    const out = mergeChartIntoTenantYaml(fixture(), opts, valuesTemplate);
    expect(out).toContain('# keep this comment on round-trip');
    expect(out).toContain('existing:');
  });

  it('is idempotent-safe: does not duplicate on re-run', () => {
    const once = mergeChartIntoTenantYaml(fixture(), opts, valuesTemplate);
    const twice = mergeChartIntoTenantYaml(once, opts, valuesTemplate);
    const doc = parseDocument(twice);
    expect(
      doc.getIn([
        'globals',
        'deployment',
        'charts',
        'widget',
        'application_repository',
      ]),
    ).toBe('mozilla/widget');
  });
});
