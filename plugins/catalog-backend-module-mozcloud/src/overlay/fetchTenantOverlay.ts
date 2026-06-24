import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';

/** Resolved `catalog.providers.mozcloud.tenants.overlay` config. */
export interface OverlayConfig {
  enabled: boolean;
  /** e.g. `https://github.com/mozilla/{function}-infra` */
  repoUrlTemplate: string;
  /** e.g. `{app_code}/catalog-info.yaml` */
  pathTemplate: string;
  /** Branch the file lives on, e.g. `main`. */
  branch: string;
}

/**
 * Read the optional `overlay` block from a tenants config. Returns
 * `undefined` when the block is absent or `enabled` is not `true`, so the
 * provider can treat overlays as opt-in.
 */
export function readOverlayConfig(config: Config): OverlayConfig | undefined {
  const overlay = config.getOptionalConfig('overlay');
  if (!overlay) return undefined;
  if (overlay.getOptionalBoolean('enabled') !== true) return undefined;
  return {
    enabled: true,
    repoUrlTemplate: overlay.getString('repoUrlTemplate'),
    pathTemplate: overlay.getString('pathTemplate'),
    branch: overlay.getOptionalString('branch') ?? 'main',
  };
}

function substitute(
  template: string,
  vars: { function: string; app_code: string },
): string {
  return template
    .replace(/\{function\}/g, vars.function)
    .replace(/\{app_code\}/g, vars.app_code);
}

/** Build the absolute blob URL for a tenant's overlay file. */
export function overlayUrl(
  cfg: OverlayConfig,
  vars: { function: string; app_code: string },
): string {
  const repo = substitute(cfg.repoUrlTemplate, vars);
  const path = substitute(cfg.pathTemplate, vars);
  return `${repo}/blob/${cfg.branch}/${path}`;
}

/**
 * Fetch a tenant's overlay file via the backend UrlReader (which uses the
 * configured GitHub integration credentials). A missing file is the common
 * case — most tenants have no overlay — and resolves to `undefined`. Other
 * read failures propagate to the caller's per-tenant try/catch.
 */
export async function fetchTenantOverlay(
  reader: UrlReaderService,
  cfg: OverlayConfig,
  vars: { function: string; app_code: string },
  logger: LoggerService,
): Promise<string | undefined> {
  const url = overlayUrl(cfg, vars);
  try {
    const response = await reader.readUrl(url);
    const buffer = await response.buffer();
    return buffer.toString('utf8');
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFoundError') {
      logger.debug(`overlay ${vars.app_code}: no overlay file at ${url}`);
      return undefined;
    }
    throw error;
  }
}
