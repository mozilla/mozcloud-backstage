import {
  createTemplateAction,
  executeShellCommand,
} from '@backstage/plugin-scaffolder-node';
import {
  resolveSafeChildPath,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { GithubCredentialsProvider } from '@backstage/integration';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { stringify } from 'yaml';

const MIN_COPIER_MAJOR_VERSION = 9;

export interface BuildCopierInvocationOptions {
  templateUrl: string;
  token: string | undefined;
  dest: string;
  dataFile: string;
}

export interface CopierInvocation {
  bin: string;
  args: string[];
  cwd: string;
}

/**
 * Inject a GitHub token into an HTTPS clone URL as
 * `https://x-access-token:<token>@github.com/...`. Non-HTTPS URLs (e.g.
 * `git@github.com:...`) and a falsy token are passed through unchanged.
 */
export function injectToken(url: string, token: string | undefined): string {
  if (!token || !/^https:\/\//.test(url)) {
    return url;
  }
  return url.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

/**
 * Resolve the token used to clone the template repo: prefer the explicit
 * (per-user) token, otherwise fall back to the GitHub integration credential.
 * Returns the original token unchanged when there's nothing to resolve or the
 * lookup fails (the caller relies on `GIT_TERMINAL_PROMPT=0` to fail fast
 * rather than hang when the resulting token can't authenticate).
 */
export async function resolveCloneToken(
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
 * copier only treats a source as a git repository when the URL starts with a
 * known git prefix (`git@`, `git://`, `git+`, `https://github.com/`,
 * `https://gitlab.com/`) or ends in `.git`. Injecting `x-access-token:...@`
 * userinfo breaks the `https://github.com/` prefix match, so ensure an HTTPS
 * URL ends in `.git` — otherwise copier treats it as a local path and fails
 * with "Local template must be a directory.".
 */
export function ensureGitUrl(url: string): string {
  if (/^https:\/\//.test(url) && !url.endsWith('.git')) {
    return `${url.replace(/\/+$/, '')}.git`;
  }
  return url;
}

/**
 * Pure builder for the `copier copy` invocation used to render the mozcloud
 * tenant skeleton in chart mode. Kept side-effect free so it can be unit
 * tested without exec'ing a real process.
 */
export function buildCopierInvocation(
  opts: BuildCopierInvocationOptions,
): CopierInvocation {
  const { templateUrl, token, dest, dataFile } = opts;
  const authedUrl = ensureGitUrl(injectToken(templateUrl, token));
  return {
    bin: 'copier',
    args: ['copy', '--defaults', '--data-file', dataFile, authedUrl, dest],
    cwd: dirname(dest),
  };
}

/** Redact a secret from any string handed to a wrapped LoggerService. */
export function redactingLogger(
  logger: LoggerService,
  secret: string | undefined,
): LoggerService {
  const redact = (message: string) =>
    secret ? message.split(secret).join('***') : message;
  return {
    error: (message: string, meta?: Error | object) =>
      logger.error(redact(message), meta as any),
    warn: (message: string, meta?: Error | object) =>
      logger.warn(redact(message), meta as any),
    info: (message: string, meta?: Error | object) =>
      logger.info(redact(message), meta as any),
    debug: (message: string, meta?: Error | object) =>
      logger.debug(redact(message), meta as any),
    // Wrap the child logger too, so redaction is not bypassed by `.child()`.
    child: (meta: object) => redactingLogger(logger.child(meta as any), secret),
  } as LoggerService;
}

/**
 * Run `copier --version` and throw unless its major version satisfies
 * {@link MIN_COPIER_MAJOR_VERSION}.
 */
function verifyCopierVersion(logger: LoggerService): void {
  const result = spawnSync('copier', ['--version'], { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`copier CLI not found on PATH: ${result.error.message}`);
  }
  const version = (result.stdout || result.stderr || '').trim();
  logger.info(`copier --version: ${version || 'unknown'}`);

  const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  const major = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(major) || major < MIN_COPIER_MAJOR_VERSION) {
    throw new Error(
      `copier >= ${MIN_COPIER_MAJOR_VERSION} is required, found: ${
        version || 'unknown'
      }`,
    );
  }
}

export interface RunCopierActionOptions {
  /**
   * Resolves a GitHub credential for the template clone when the step is not
   * given an explicit (per-user) token — e.g. local dev, where no GitHub OAuth
   * provider is configured. Mirrors how the built-in fetch/publish actions fall
   * back to the `integrations.github` token.
   */
  githubCredentials?: GithubCredentialsProvider;
}

export function createRunCopierAction(options: RunCopierActionOptions = {}) {
  const { githubCredentials } = options;
  return createTemplateAction({
    id: 'run:copier',
    description:
      "Render the mozcloud tenant skeleton via the copier CLI in chart mode ('copier copy --defaults').",
    schema: {
      input: {
        templateUrl: z =>
          z
            .string()
            .describe(
              'HTTPS git URL of the copier template (skeleton) repository',
            ),
        targetPath: z =>
          z
            .string()
            .describe(
              'Destination directory to render into, relative to the workspace',
            ),
        token: z =>
          z
            .string()
            .describe(
              'Token used to authenticate the template clone (injected into the HTTPS URL)',
            )
            .optional(),
        data: z =>
          z
            .object({
              name: z.string().describe('Chart name'),
              function: z.string().describe('Tenant function'),
              environments: z
                .array(z.string())
                .describe('Environments to render values for'),
            })
            .describe('Copier answers for chart mode'),
      },
    },
    async handler(ctx) {
      const { templateUrl, targetPath, token, data } = ctx.input;

      const dest = resolveSafeChildPath(ctx.workspacePath, targetPath);
      mkdirSync(dirname(dest), { recursive: true });

      const dataFile = join(ctx.workspacePath, '.copier-data.yml');
      writeFileSync(
        dataFile,
        stringify({
          kind: 'chart',
          name: data.name,
          function: data.function,
          environments: data.environments,
        }),
        'utf8',
      );

      verifyCopierVersion(ctx.logger);

      // Prefer the per-user token (requestUserCredentials); otherwise fall back
      // to the GitHub integration credential so the private skeleton can still
      // be cloned in environments without a GitHub OAuth provider (local dev).
      const cloneToken = await resolveCloneToken(
        token,
        githubCredentials,
        templateUrl,
        ctx.logger,
      );

      const { bin, args, cwd } = buildCopierInvocation({
        templateUrl,
        token: cloneToken,
        dest,
        dataFile,
      });

      ctx.logger.info(`Running copier against ${templateUrl} -> ${dest}`);
      await executeShellCommand({
        command: bin,
        args,
        options: {
          cwd,
          // Never let the underlying `git clone` block on an interactive
          // credential prompt — there's no TTY, so it would hang forever. Fail
          // fast instead when the token is missing or unauthorized.
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GCM_INTERACTIVE: 'never',
          },
        },
        logger: redactingLogger(ctx.logger, cloneToken),
      });
      ctx.logger.info('copier run complete');
    },
  });
}
