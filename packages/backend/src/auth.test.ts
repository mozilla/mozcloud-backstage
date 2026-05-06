import { gcpIapSignInResolver } from './auth';

const makeInfo = (email: string | undefined) =>
  ({
    profile: { email },
    result: {} as any,
  } as any);

const makeCtx = (
  overrides: Partial<{
    signInWithCatalogUser: jest.Mock;
    issueToken: jest.Mock;
  }> = {},
) =>
  ({
    signInWithCatalogUser: jest.fn(),
    issueToken: jest.fn(),
    findCatalogUser: jest.fn(),
    resolveOwnershipEntityRefs: jest.fn(),
    ...overrides,
  } as any);

describe('gcpIapSignInResolver', () => {
  it('rejects when the profile has no email', async () => {
    const ctx = makeCtx();
    await expect(
      gcpIapSignInResolver(makeInfo(undefined), ctx),
    ).rejects.toThrow('User profile contained no email');
    expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
    expect(ctx.issueToken).not.toHaveBeenCalled();
  });

  it('rejects email outside the allowed domains', async () => {
    const ctx = makeCtx();
    await expect(
      gcpIapSignInResolver(makeInfo('user@gmail.com'), ctx),
    ).rejects.toThrow(/does not belong to the expected domain/);
    expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
  });

  it('rejects email that look-alikes a Mozilla domain', async () => {
    const ctx = makeCtx();
    await expect(
      gcpIapSignInResolver(makeInfo('user@notmozilla.com'), ctx),
    ).rejects.toThrow(/does not belong to the expected domain/);
    await expect(
      gcpIapSignInResolver(makeInfo('user@mozilla.com.evil.com'), ctx),
    ).rejects.toThrow(/does not belong to the expected domain/);
  });

  it('rejects email with no @ separator', async () => {
    const ctx = makeCtx();
    await expect(
      gcpIapSignInResolver(makeInfo('not-an-email'), ctx),
    ).rejects.toThrow(/does not belong to the expected domain/);
  });

  it('signs in with catalog user when email is mozilla.com', async () => {
    const expected = { token: 'tok-1' };
    const ctx = makeCtx({
      signInWithCatalogUser: jest.fn().mockResolvedValue(expected),
    });
    const result = await gcpIapSignInResolver(
      makeInfo('alice@mozilla.com'),
      ctx,
    );
    expect(result).toBe(expected);
    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      entityRef: { name: 'alice' },
    });
    expect(ctx.issueToken).not.toHaveBeenCalled();
  });

  it('signs in with catalog user when email is firefox.gcp.mozilla.com', async () => {
    const expected = { token: 'tok-2' };
    const ctx = makeCtx({
      signInWithCatalogUser: jest.fn().mockResolvedValue(expected),
    });
    const result = await gcpIapSignInResolver(
      makeInfo('bob@firefox.gcp.mozilla.com'),
      ctx,
    );
    expect(result).toBe(expected);
    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      entityRef: { name: 'bob' },
    });
  });

  it('falls back to issueToken when catalog lookup fails', async () => {
    const expected = { token: 'fallback-tok' };
    const ctx = makeCtx({
      signInWithCatalogUser: jest
        .fn()
        .mockRejectedValue(new Error('user not found')),
      issueToken: jest.fn().mockResolvedValue(expected),
    });
    const result = await gcpIapSignInResolver(
      makeInfo('carol@mozilla.com'),
      ctx,
    );
    expect(result).toBe(expected);
    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: {
        sub: 'user:default/carol',
        ent: ['user:default/carol'],
      },
    });
  });
});
