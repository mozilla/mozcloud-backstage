import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeCopierEnvironments, parseTenantContext } from './readTenant';

const fixture = () =>
  readFileSync(resolve(__dirname, '../__fixtures__/tenant.yaml'), 'utf8');

describe('parseTenantContext', () => {
  it('reads function + unique env names from the tenant yaml', () => {
    const ctx = parseTenantContext(fixture());
    expect(ctx.function).toBe('webservices');
    expect(ctx.environments.sort()).toEqual(['dev', 'prod', 'stage']);
  });

  it('throws when globals.function is missing', () => {
    expect(() => parseTenantContext('globals: {}\nrealms: {}\n')).toThrow(
      /globals\.function/,
    );
  });

  it('de-duplicates an env name shared across realms', () => {
    const yaml = `
globals: { function: webservices }
realms:
  nonprod:
    environments: [{ name: dev }, { name: stage }]
  prod:
    environments: [{ name: dev }, { name: prod }]
`;
    expect(parseTenantContext(yaml).environments.sort()).toEqual([
      'dev',
      'prod',
      'stage',
    ]);
  });
});

describe('computeCopierEnvironments', () => {
  it('keeps only dev/stage/prod when the tenant has a mix', () => {
    expect(computeCopierEnvironments(['dev', 'qa', 'prod'])).toEqual([
      'dev',
      'prod',
    ]);
  });

  it('falls back to all three when the tenant matches none (e.g. only test)', () => {
    expect(computeCopierEnvironments(['test'])).toEqual([
      'dev',
      'stage',
      'prod',
    ]);
  });
});
