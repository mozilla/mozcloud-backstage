import { LoggerService } from '@backstage/backend-plugin-api';
import { ZodType, ZodTypeDef } from 'zod';
import { Source } from './Source';

/** OAuth2 client-credentials config for the CIS Person API (via Auth0). */
export interface PersonApiAuthConfig {
  tokenUrl: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

export interface DefinePersonApiSourceOptions<T> {
  auth: PersonApiAuthConfig;
  /** e.g. `https://person.api.sso.mozilla.com/v2` (no trailing slash). */
  apiBaseUrl: string;
  /** Path + query under apiBaseUrl, e.g. `/users/id/all/by_attribute_contains?...`. */
  listPath: string;
  /** Validates each unwrapped profile; bad rows are skipped and logged. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Flattens a raw CIS profile before validation. */
  unwrap: (raw: Record<string, unknown>) => unknown;
  /** Stable identifier — used in logs and as the provider location key. */
  description: string;
  logger: LoggerService;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (ms) for tests; defaults to Date.now. */
  now?: () => number;
}

interface UsersPage {
  users?: unknown[];
  Items?: unknown[];
  nextPage?: string | null;
}

/**
 * A {@link Source} that reads CIS Person API profiles over HTTP.
 *
 * Concerns handled in one place, mirroring {@link defineBigQuerySource}:
 * - **Auth** — OAuth2 client-credentials token, cached in memory until ~60s
 *   before expiry; a `401` triggers a single forced re-auth + retry.
 * - **Pagination** — follows the `nextPage` token until null.
 * - **Validation** — each profile is unwrapped then parsed through `schema`;
 *   a parse failure logs a warning and skips the row.
 */
export function definePersonApiSource<T>(
  opts: DefinePersonApiSourceOptions<T>,
): Source<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Date.now());
  let cached: { token: string; expiresAt: number } | undefined;

  async function getToken(force = false): Promise<string> {
    if (!force && cached && now() < cached.expiresAt) return cached.token;
    const res = await doFetch(opts.auth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        audience: opts.auth.audience,
        client_id: opts.auth.clientId,
        client_secret: opts.auth.clientSecret,
        ...(opts.auth.scope ? { scope: opts.auth.scope } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Person API token request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    cached = {
      token: body.access_token,
      expiresAt: now() + Math.max(0, (body.expires_in - 60) * 1000),
    };
    return cached.token;
  }

  async function fetchPage(url: string): Promise<UsersPage> {
    let token = await getToken();
    let res = await doFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      token = await getToken(true);
      res = await doFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (!res.ok) {
      throw new Error(`Person API page request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as UsersPage;
  }

  return {
    description: opts.description,
    async fetchAll(): Promise<T[]> {
      const out: T[] = [];
      const sep = opts.listPath.includes('?') ? '&' : '?';
      let nextPage: string | null | undefined;
      do {
        const pageQuery = nextPage ? `${sep}nextPage=${nextPage}` : '';
        const url = `${opts.apiBaseUrl}${opts.listPath}${pageQuery}`;
        const page = await fetchPage(url);
        for (const item of page.users ?? page.Items ?? []) {
          try {
            const unwrapped = opts.unwrap(item as Record<string, unknown>);
            out.push(opts.schema.parse(unwrapped));
          } catch (error) {
            opts.logger.warn(
              `${opts.description}: skipping invalid profile: ${
                (error as Error).message
              }`,
            );
          }
        }
        nextPage = page.nextPage ?? null;
      } while (nextPage);
      return out;
    },
  };
}
