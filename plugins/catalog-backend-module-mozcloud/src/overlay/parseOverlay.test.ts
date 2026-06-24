import { mockServices } from '@backstage/backend-test-utils';
import { parseOverlay, isEntity } from './parseOverlay';

const opts = () => ({
  description: 'overlay:test',
  logger: mockServices.logger.mock(),
});

describe('parseOverlay', () => {
  it('parses a multi-document file into entities', () => {
    const yaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: merino
spec:
  owner: group:workgroups/merino
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: merino-suggest
spec:
  type: openapi
  lifecycle: production
  owner: group:workgroups/merino
`;
    const entities = parseOverlay(yaml, opts());
    expect(entities.map(e => `${e.kind}:${e.metadata.name}`)).toEqual([
      'System:merino',
      'API:merino-suggest',
    ]);
  });

  it('returns [] and logs on malformed YAML', () => {
    const logger = mockServices.logger.mock();
    const result = parseOverlay('this: : : not: valid', {
      description: 'overlay:test',
      logger,
    });
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips documents that are not entities', () => {
    const logger = mockServices.logger.mock();
    const yaml = `
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: merino
---
just-a-string
---
kind: NoApiVersion
metadata:
  name: bad
`;
    const result = parseOverlay(yaml, { description: 'overlay:test', logger });
    expect(result.map(e => e.metadata.name)).toEqual(['merino']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('isEntity accepts a well-formed entity and rejects junk', () => {
    expect(
      isEntity({ apiVersion: 'v1', kind: 'API', metadata: { name: 'x' } }),
    ).toBe(true);
    expect(isEntity({ kind: 'API', metadata: { name: 'x' } })).toBe(false);
    expect(isEntity({ apiVersion: 'v1', kind: 'API', metadata: {} })).toBe(
      false,
    );
    expect(isEntity('nope')).toBe(false);
    expect(isEntity(null)).toBe(false);
  });
});
