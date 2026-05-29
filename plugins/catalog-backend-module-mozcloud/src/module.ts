import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { MozcloudTenantEntityProvider } from './MozcloudTenantEntityProvider';
import { MozcloudWorkgroupEntityProvider } from './MozcloudWorkgroupEntityProvider';

/**
 * Backstage backend module that registers the mozcloud tenant and
 * workgroup catalog entity providers under the existing catalog plugin.
 *
 * Configuration lives under `catalog.providers.mozcloud` — see config.d.ts.
 * Each provider owns its own BigQuery wiring via `createFromConfig`; this
 * module just hands the right config block to each.
 */
export const catalogModuleMozcloud = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'mozcloud',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, scheduler }) {
        const root = config.getOptionalConfig('catalog.providers.mozcloud');
        if (!root) {
          logger.info(
            'mozcloud provider not configured (catalog.providers.mozcloud); skipping',
          );
          return;
        }

        const tenantsCfg = root.getOptionalConfig('tenants');
        if (tenantsCfg) {
          const provider = MozcloudTenantEntityProvider.createFromConfig(
            tenantsCfg,
            logger,
            scheduler,
          );
          catalog.addEntityProvider(provider);
          logger.info(
            `Registered mozcloud tenant provider (${provider.description})`,
          );
        }

        const wgCfg = root.getOptionalConfig('workgroups');
        if (wgCfg) {
          const provider = MozcloudWorkgroupEntityProvider.createFromConfig(
            wgCfg,
            logger,
            scheduler,
          );
          catalog.addEntityProvider(provider);
          logger.info(
            `Registered mozcloud workgroup provider (${provider.description})`,
          );
        }
      },
    });
  },
});

export default catalogModuleMozcloud;
