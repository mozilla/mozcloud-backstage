import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { GithubCredentialsProvider } from '@backstage/integration';

/**
 * Resolve the token used for a GitHub operation: prefer the explicit (per-user)
 * token, otherwise fall back to the GitHub integration credential. Returns the
 * original token unchanged when there's nothing to resolve or the lookup fails.
 *
 * Shared by the actions that touch GitHub (`github:ensureAuth`, `run:copier`)
 * so credential resolution lives in one place.
 */
export async function resolveGithubToken(
  token: string | undefined,
  githubCredentials: GithubCredentialsProvider | undefined,
  url: string,
  logger: LoggerService,
): Promise<string | undefined> {
  if (token || !githubCredentials) {
    return token;
  }
  try {
    const { token: resolved } = await githubCredentials.getCredentials({ url });
    return resolved;
  } catch (e) {
    logger.warn(
      `Could not resolve a GitHub integration credential for ${url}: ${e}`,
    );
    return token;
  }
}

/**
 * Parse an `owner/repo`, a scaffolder `github.com?owner=o&repo=r` repoUrl, or a
 * `https://github.com/o/r(.git)` URL into `{ owner, repo }`.
 */
export function parseOwnerRepo(input: string): { owner: string; repo: string } {
  const trimmed = input.trim();

  if (trimmed.includes('owner=')) {
    const params = new URLSearchParams(trimmed.split('?')[1] ?? trimmed);
    const owner = params.get('owner');
    const repo = params.get('repo');
    if (owner && repo) {
      return { owner, repo };
    }
  }

  const path = trimmed
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  throw new Error(`Could not parse owner/repo from '${input}'`);
}

export interface EnsureGithubAuthOptions {
  githubCredentials?: GithubCredentialsProvider;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

export function createEnsureGithubAuthAction(
  options: EnsureGithubAuthOptions = {},
) {
  const { githubCredentials, fetchFn = fetch } = options;
  return createTemplateAction({
    id: 'github:ensureAuth',
    description:
      'Resolve the effective GitHub token (per-user token, else the integration credential) and verify read access to the given repositories, failing early with a clear message.',
    schema: {
      input: {
        repositories: z =>
          z
            .array(z.string())
            .describe(
              'Repositories to verify access to (owner/repo, a github.com?owner=&repo= repoUrl, or an https URL)',
            ),
        token: z =>
          z
            .string()
            .describe(
              'Per-user GitHub token; falls back to the integration credential when empty',
            )
            .optional(),
      },
    },
    async handler(ctx) {
      const { repositories, token } = ctx.input;
      for (const ref of repositories) {
        const { owner, repo } = parseOwnerRepo(ref);
        const url = `https://github.com/${owner}/${repo}`;
        const effective = await resolveGithubToken(
          token,
          githubCredentials,
          url,
          ctx.logger,
        );
        if (!effective) {
          throw new Error(
            `No GitHub credentials available to access ${owner}/${repo}. ` +
              'Configure the github auth provider (per-user) or the integrations.github token.',
          );
        }
        const res = await fetchFn(
          `https://api.github.com/repos/${owner}/${repo}`,
          {
            headers: {
              Authorization: `Bearer ${effective}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'mozcloud-backstage-scaffolder',
            },
          },
        );
        if (res.status === 200) {
          ctx.logger.info(`GitHub access verified for ${owner}/${repo}`);
          continue;
        }
        if (res.status === 401) {
          throw new Error(
            `GitHub token is invalid or expired (401) accessing ${owner}/${repo}.`,
          );
        }
        if (res.status === 403) {
          throw new Error(
            `GitHub token lacks access to ${owner}/${repo} (403 — likely org SAML SSO not authorized, or insufficient permission).`,
          );
        }
        if (res.status === 404) {
          throw new Error(
            `${owner}/${repo} not found, or the token cannot see it (404).`,
          );
        }
        throw new Error(
          `Unexpected status ${res.status} verifying GitHub access to ${owner}/${repo}.`,
        );
      }
    },
  });
}
