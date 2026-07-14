import { parseOwnerRepo, resolveGithubToken } from './ensureGithubAuth';

const noopLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => noopLogger,
} as any;

describe('resolveGithubToken', () => {
  const url = 'https://github.com/mozilla/mozcloud-tenant-skeleton';

  it('returns the explicit token unchanged (no integration lookup)', async () => {
    const provider = { getCredentials: jest.fn() } as any;
    await expect(
      resolveGithubToken('ghu_user', provider, url, noopLogger),
    ).resolves.toBe('ghu_user');
    expect(provider.getCredentials).not.toHaveBeenCalled();
  });

  it('falls back to the integration credential when no token is given', async () => {
    const provider = {
      getCredentials: jest.fn().mockResolvedValue({ token: 'ghs_integration' }),
    } as any;
    await expect(
      resolveGithubToken('', provider, url, noopLogger),
    ).resolves.toBe('ghs_integration');
    expect(provider.getCredentials).toHaveBeenCalledWith({ url });
  });

  it('returns the original token when there is no credentials provider', async () => {
    await expect(
      resolveGithubToken(undefined, undefined, url, noopLogger),
    ).resolves.toBeUndefined();
  });

  it('swallows a credential-lookup failure and returns the original token', async () => {
    const provider = {
      getCredentials: jest.fn().mockRejectedValue(new Error('no integration')),
    } as any;
    await expect(
      resolveGithubToken(undefined, provider, url, noopLogger),
    ).resolves.toBeUndefined();
  });
});

describe('parseOwnerRepo', () => {
  it('parses owner/repo', () => {
    expect(parseOwnerRepo('mozilla/global-platform-admin')).toEqual({
      owner: 'mozilla',
      repo: 'global-platform-admin',
    });
  });

  it('parses a scaffolder github.com?owner=&repo= repoUrl', () => {
    expect(
      parseOwnerRepo('github.com?owner=mozilla&repo=webservices-infra'),
    ).toEqual({ owner: 'mozilla', repo: 'webservices-infra' });
  });

  it('parses an https URL, stripping .git', () => {
    expect(
      parseOwnerRepo('https://github.com/mozilla/mozcloud-tenant-skeleton.git'),
    ).toEqual({ owner: 'mozilla', repo: 'mozcloud-tenant-skeleton' });
  });

  it('throws on an unparseable input', () => {
    expect(() => parseOwnerRepo('nope')).toThrow(/parse owner\/repo/);
  });
});
