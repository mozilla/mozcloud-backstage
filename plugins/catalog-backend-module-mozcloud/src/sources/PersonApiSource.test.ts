import { mockServices } from '@backstage/backend-test-utils';
import { z } from 'zod';
import { definePersonApiSource, PersonApiAuthConfig } from './PersonApiSource';

const auth: PersonApiAuthConfig = {
  tokenUrl: 'https://auth.example/oauth/token',
  audience: 'api.sso.mozilla.com',
  clientId: 'id',
  clientSecret: 'secret',
  scope: 'classification:workgroup:staff_only display:ndaed',
};
const rowSchema = z.object({ primary_email: z.string() });
const unwrap = (raw: Record<string, unknown>) => ({
  primary_email: (raw.primary_email as { value?: string } | undefined)?.value,
});

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Resp => ({
  ok: true,
  status: 200,
  json: async () => body,
});
const unauthorized = (): Resp => ({
  ok: false,
  status: 401,
  json: async () => ({}),
});

function makeSource(fetchImpl: jest.Mock, now: () => number) {
  return definePersonApiSource({
    auth,
    apiBaseUrl: 'https://person.example/v2',
    listPath: '/users?staff=True',
    schema: rowSchema,
    unwrap,
    description: 'person-api:test',
    logger: mockServices.logger.mock(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now,
  });
}

const tokenBody = { access_token: 'tok-1', expires_in: 3600 };
const profile = (email: string) => ({ primary_email: { value: email } });

describe('definePersonApiSource', () => {
  it('authenticates once and follows nextPage to completion', async () => {
    const fetchImpl = jest.fn();
    // token
    fetchImpl.mockResolvedValueOnce(ok(tokenBody));
    // page 1
    fetchImpl.mockResolvedValueOnce(
      ok({ Items: [profile('a@m.com')], nextPage: 'p2' }),
    );
    // page 2
    fetchImpl.mockResolvedValueOnce(
      ok({ Items: [profile('b@m.com')], nextPage: null }),
    );

    const source = makeSource(fetchImpl, () => 1000);
    const rows = await source.fetchAll();

    expect(rows).toEqual([
      { primary_email: 'a@m.com' },
      { primary_email: 'b@m.com' },
    ]);
    // 1 token + 2 list calls
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://auth.example/oauth/token');
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://person.example/v2/users?staff=True',
    );
    expect(fetchImpl.mock.calls[2][0]).toContain('nextPage=p2');
    // bearer header on list calls
    expect((fetchImpl.mock.calls[1][1] as any).headers.Authorization).toBe(
      'Bearer tok-1',
    );
  });

  it('reuses the cached token across fetchAll calls until it expires', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce(ok(tokenBody)); // token @ t=0
    fetchImpl.mockResolvedValueOnce(ok({ Items: [], nextPage: null }));
    fetchImpl.mockResolvedValueOnce(ok({ Items: [], nextPage: null })); // 2nd call, still cached
    let t = 0;
    const source = makeSource(fetchImpl, () => t);

    await source.fetchAll();
    t = 1000; // 1s later, well within 3600s
    await source.fetchAll();
    // token fetched once, two list calls => 3 total
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('refetches the token after expiry', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce(
      ok({ access_token: 'tok-1', expires_in: 100 }),
    );
    fetchImpl.mockResolvedValueOnce(ok({ Items: [], nextPage: null }));
    fetchImpl.mockResolvedValueOnce(
      ok({ access_token: 'tok-2', expires_in: 100 }),
    );
    fetchImpl.mockResolvedValueOnce(ok({ Items: [], nextPage: null }));
    let t = 0;
    const source = makeSource(fetchImpl, () => t);

    await source.fetchAll();
    t = 200_000; // past 100s - 60s buffer
    await source.fetchAll();
    expect(fetchImpl.mock.calls[2][0]).toBe('https://auth.example/oauth/token');
  });

  it('re-auths once and retries on a 401 mid-page', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce(ok(tokenBody)); // token
    fetchImpl.mockResolvedValueOnce(unauthorized()); // page 401
    fetchImpl.mockResolvedValueOnce(
      ok({ access_token: 'tok-2', expires_in: 3600 }),
    ); // re-auth
    fetchImpl.mockResolvedValueOnce(
      ok({ Items: [profile('a@m.com')], nextPage: null }),
    ); // retry ok
    const source = makeSource(fetchImpl, () => 0);

    const rows = await source.fetchAll();
    expect(rows).toEqual([{ primary_email: 'a@m.com' }]);
    expect((fetchImpl.mock.calls[3][1] as any).headers.Authorization).toBe(
      'Bearer tok-2',
    );
  });

  it('skips a profile that fails validation', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce(ok(tokenBody));
    fetchImpl.mockResolvedValueOnce(
      ok({
        Items: [profile('a@m.com'), { primary_email: { value: undefined } }],
        nextPage: null,
      }),
    );
    const source = makeSource(fetchImpl, () => 0);
    const rows = await source.fetchAll();
    expect(rows).toEqual([{ primary_email: 'a@m.com' }]);
  });
});
