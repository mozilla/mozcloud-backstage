import {
  createTemplateAction,
  executeShellCommand,
} from '@backstage/plugin-scaffolder-node';
import {
  resolveSafeChildPath,
  LoggerService,
} from '@backstage/backend-plugin-api';
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
 * Pure builder for the `copier copy` invocation used to render the mozcloud
 * tenant skeleton in chart mode. Kept side-effect free so it can be unit
 * tested without exec'ing a real process.
 */
export function buildCopierInvocation(
  opts: BuildCopierInvocationOptions,
): CopierInvocation {
  const { templateUrl, token, dest, dataFile } = opts;
  const authedUrl = injectToken(templateUrl, token);
  return {
    bin: 'copier',
    args: ['copy', '--defaults', '--data-file', dataFile, authedUrl, dest],
    cwd: dirname(dest),
  };
}

/** Redact a secret from any string handed to a wrapped LoggerService. */
function redactingLogger(logger: LoggerService, secret: string | undefined) {
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
    child: (meta: object) => logger.child(meta as any),
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

export function createRunCopierAction() {
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

      const { bin, args, cwd } = buildCopierInvocation({
        templateUrl,
        token,
        dest,
        dataFile,
      });

      ctx.logger.info(`Running copier against ${templateUrl} -> ${dest}`);
      await executeShellCommand({
        command: bin,
        args,
        options: { cwd },
        logger: redactingLogger(ctx.logger, token),
      });
      ctx.logger.info('copier run complete');
    },
  });
}
