import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDocument } from 'yaml';
import { mergeChartIntoTenantYaml } from './addChart';

const fixture = () =>
  readFileSync(resolve(__dirname, '../__fixtures__/tenant.yaml'), 'utf8');

const opts = {
  chartName: 'widget',
  applicationRepository: 'mozilla/widget',
  imageName: 'widget',
};

describe('mergeChartIntoTenantYaml', () => {
  it('adds the chart under globals.deployment.charts with derived image mapping', () => {
    const doc = parseDocument(mergeChartIntoTenantYaml(fixture(), opts));
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

  it('adds a per-environment charts entry with release_name + env-specific image_regex', () => {
    const out = mergeChartIntoTenantYaml(fixture(), opts);
    const doc = parseDocument(out);
    // find the prod env
    const realms: any = doc.toJS().realms;
    const prodEnv = realms.prod.environments.find(
      (e: any) => e.name === 'prod',
    );
    expect(prodEnv.charts.widget.release_name).toBe('widget');
    expect(prodEnv.charts.widget.images.widget.image_regex).toBe(
      '^prod-.{40}$',
    );
    // every environment gets an entry with its own env-specific regex
    const byName = (name: string) =>
      realms.nonprod.environments.find((e: any) => e.name === name);
    expect(byName('dev').charts.widget.images.widget.image_regex).toBe(
      '^dev-.{40}$',
    );
    expect(byName('stage').charts.widget.images.widget.image_regex).toBe(
      '^stage-.{40}$',
    );
  });

  it('preserves existing comments and the existing chart', () => {
    const out = mergeChartIntoTenantYaml(fixture(), opts);
    expect(out).toContain('# keep this comment on round-trip');
    expect(out).toContain('existing:');
  });

  it('is idempotent-safe: does not duplicate on re-run', () => {
    const once = mergeChartIntoTenantYaml(fixture(), opts);
    const twice = mergeChartIntoTenantYaml(once, opts);
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
