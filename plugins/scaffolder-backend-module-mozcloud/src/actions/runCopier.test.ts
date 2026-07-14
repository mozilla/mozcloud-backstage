import {
  buildCopierInvocation,
  buildGitAuthEnv,
  ensureGitUrl,
  redactingLogger,
} from './runCopier';

describe('redactingLogger', () => {
  const makeSpyLogger = () => {
    const logger: any = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => logger),
    };
    return logger;
  };

  it('replaces the secret in messages at every level', () => {
    const base = makeSpyLogger();
    const log = redactingLogger(base, 'ghs_secret');
    log.info('cloning https://x-access-token:ghs_secret@github.com/x');
    log.error('boom ghs_secret');
    expect(base.info).toHaveBeenCalledWith(
      'cloning https://x-access-token:***@github.com/x',
      undefined,
    );
    expect(base.error).toHaveBeenCalledWith('boom ***', undefined);
  });

  it('still redacts through a child logger (no bypass)', () => {
    const base = makeSpyLogger();
    const child = redactingLogger(base, 'ghs_secret').child({ run: 1 });
    child.info('child log ghs_secret here');
    expect(base.info).toHaveBeenCalledWith('child log *** here', undefined);
  });

  it('passes messages through unchanged when there is no secret', () => {
    const base = makeSpyLogger();
    redactingLogger(base, undefined).info('nothing to hide');
    expect(base.info).toHaveBeenCalledWith('nothing to hide', undefined);
  });
});

describe('buildCopierInvocation', () => {
  it('builds a headless copier chart invocation with a bare (credential-free) URL', () => {
    const { bin, args, cwd } = buildCopierInvocation({
      templateUrl: 'https://github.com/mozilla/mozcloud-tenant-skeleton',
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
    // The source URL is bare + git-suffixed, placed right before the dest.
    expect(args[args.length - 2]).toBe(
      'https://github.com/mozilla/mozcloud-tenant-skeleton.git',
    );
    expect(args[args.length - 1]).toBe('/ws/infra/acme');
    expect(cwd).toBe('/ws/infra');
  });

  it('never embeds a credential in the clone URL (regression: copier _src_path leak)', () => {
    const { args } = buildCopierInvocation({
      templateUrl: 'https://github.com/mozilla/mozcloud-tenant-skeleton',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(args.join(' ')).not.toContain('x-access-token');
    expect(args.join(' ')).not.toContain('@github.com');
  });

  it('passes a non-https (scp-style) URL through unchanged', () => {
    const { args } = buildCopierInvocation({
      templateUrl: 'git@github.com:mozilla/mozcloud-tenant-skeleton.git',
      dest: '/ws/infra/acme',
      dataFile: '/ws/.copier-data.yml',
    });

    expect(args).toContain(
      'git@github.com:mozilla/mozcloud-tenant-skeleton.git',
    );
  });
});

describe('buildGitAuthEnv', () => {
  it('returns an http.extraheader with the token as Basic auth (never in a URL)', () => {
    const env = buildGitAuthEnv('ghs_secret');
    expect(env.GIT_CONFIG_COUNT).toBe('1');
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    const expected = Buffer.from('x-access-token:ghs_secret').toString(
      'base64',
    );
    expect(env.GIT_CONFIG_VALUE_0).toBe(`Authorization: Basic ${expected}`);
    // the raw token is not present verbatim (it's base64-encoded)
    expect(env.GIT_CONFIG_VALUE_0).not.toContain('ghs_secret');
  });

  it('returns an empty env when there is no token', () => {
    expect(buildGitAuthEnv(undefined)).toEqual({});
    expect(buildGitAuthEnv('')).toEqual({});
  });
});

describe('ensureGitUrl', () => {
  it('appends .git to an https URL that lacks it', () => {
    expect(ensureGitUrl('https://github.com/mozilla/skeleton')).toBe(
      'https://github.com/mozilla/skeleton.git',
    );
  });

  it('appends .git to a token-authed https URL (copier git detection)', () => {
    expect(
      ensureGitUrl('https://x-access-token:t@github.com/mozilla/skeleton'),
    ).toBe('https://x-access-token:t@github.com/mozilla/skeleton.git');
  });

  it('does not double-suffix a URL already ending in .git', () => {
    expect(ensureGitUrl('https://github.com/mozilla/skeleton.git')).toBe(
      'https://github.com/mozilla/skeleton.git',
    );
  });

  it('strips a trailing slash before appending .git', () => {
    expect(ensureGitUrl('https://github.com/mozilla/skeleton/')).toBe(
      'https://github.com/mozilla/skeleton.git',
    );
  });

  it('leaves non-https (scp-style) URLs untouched', () => {
    expect(ensureGitUrl('git@github.com:mozilla/skeleton.git')).toBe(
      'git@github.com:mozilla/skeleton.git',
    );
  });
});
