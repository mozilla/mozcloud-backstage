import { mockServices } from '@backstage/backend-test-utils';
import { UrlReaderService } from '@backstage/backend-plugin-api';
import {
  OverlayConfig,
  overlayUrl,
  fetchTenantOverlay,
} from './fetchTenantOverlay';

const cfg: OverlayConfig = {
  enabled: true,
  repoUrlTemplate: 'https://github.com/mozilla/{function}-infra',
  pathTemplate: '{app_code}/catalog-info.yaml',
  branch: 'main',
};
const vars = { function: 'webservices', app_code: 'merino' };

function fakeReader(impl: Partial<UrlReaderService>): UrlReaderService {
  return impl as unknown as UrlReaderService;
}

describe('overlayUrl', () => {
  it('substitutes function and app_code into the blob URL', () => {
    expect(overlayUrl(cfg, vars)).toBe(
      'https://github.com/mozilla/webservices-infra/blob/main/merino/catalog-info.yaml',
    );
  });
});

describe('fetchTenantOverlay', () => {
  it('returns file contents on success', async () => {
    const reader = fakeReader({
      readUrl: async () => ({ buffer: async () => Buffer.from('kind: API') } as any),
    });
    const result = await fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock());
    expect(result).toBe('kind: API');
  });

  it('returns undefined when the file is not found', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFoundError' });
    const reader = fakeReader({
      readUrl: async () => {
        throw notFound;
      },
    });
    const result = await fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock());
    expect(result).toBeUndefined();
  });

  it('rethrows non-NotFound errors', async () => {
    const reader = fakeReader({
      readUrl: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      fetchTenantOverlay(reader, cfg, vars, mockServices.logger.mock()),
    ).rejects.toThrow('boom');
  });
});
