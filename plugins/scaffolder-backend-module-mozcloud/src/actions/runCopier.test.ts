import { buildCopierInvocation, resolveCloneToken } from './runCopier';

const noopLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => noopLogger,
} as any;

describe('resolveCloneToken', () => {
  const url = 'https://github.com/mozilla/mozcloud-tenant-skeleton';

  it('returns the explicit token unchanged (no integration lookup)', async () => {
    const provider = { getCredentials: jest.fn() } as any;
    await expect(
      resolveCloneToken('ghu_user', provider, url, noopLogger),
    ).resolves.toBe('ghu_user');
    expect(provider.getCredentials).not.toHaveBeenCalled();
  });

  it('falls back to the integration credential when no token is given', async () => {
    const provider = {
      getCredentials: jest.fn().mockResolvedValue({ token: 'ghs_integration' }),
    } as any;
    await expect(
      resolveCloneToken('', provider, url, noopLogger),
    ).resolves.toBe('ghs_integration');
    expect(provider.getCredentials).toHaveBeenCalledWith({ url });
  });

  it('returns the original token when there is no credentials provider', async () => {
    await expect(
      resolveCloneToken(undefined, undefined, url, noopLogger),
    ).resolves.toBeUndefined();
  });

  it('swallows a credential-lookup failure and returns the original token', async () => {
    const provider = {
      getCredentials: jest.fn().mockRejectedValue(new Error('no integration')),
    } as any;
    await expect(
      resolveCloneToken(undefined, provider, url, noopLogger),
    ).resolves.toBeUndefined();
  });
});

describe('buildCopierInvocation', () => {
  it('builds a headless copier chart invocation with token auth + data', () => {
    const { bin, args, cwd } = buildCopierInvocation({
      templateUrl: 'https://github.com/mozilla/mozcloud-tenant-skeleton',
      token: 'ghs_x',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(bin).toBe('copier');
    expect(args).toEqual(
      expect.arrayContaining([
        'copy',
        '--defaults',
        '--data-file',
        '/ws/.copier-data.yml',
      ]),
    );
    // token injected into the clone URL
    expect(args.join(' ')).toContain(
      'x-access-token:ghs_x@github.com/mozilla/mozcloud-tenant-skeleton',
    );
    expect(args[args.length - 1]).toBe('/ws/infra/acme');
    expect(cwd).toBe('/ws/infra');
  });

  it('places the token-authed URL immediately before the destination', () => {
    const { args } = buildCopierInvocation({
      templateUrl: 'https://github.com/mozilla/mozcloud-tenant-skeleton',
      token: 'ghs_x',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(args[args.length - 2]).toContain('x-access-token:ghs_x@');
    expect(args[args.length - 1]).toBe('/ws/infra/acme');
  });

  it('does not mutate a template URL that already has no https prefix', () => {
    const { args } = buildCopierInvocation({
      templateUrl: 'git@github.com:mozilla/mozcloud-tenant-skeleton.git',
      token: 'ghs_x',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(args).toContain(
      'git@github.com:mozilla/mozcloud-tenant-skeleton.git',
    );
    expect(args.join(' ')).not.toContain('x-access-token');
  });

  it('leaves the URL bare when no token is provided', () => {
    const { args } = buildCopierInvocation({
      templateUrl: 'https://github.com/mozilla/mozcloud-tenant-skeleton',
      token: '',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(args).toContain(
      'https://github.com/mozilla/mozcloud-tenant-skeleton',
    );
    expect(args.join(' ')).not.toContain('x-access-token');
  });
});
