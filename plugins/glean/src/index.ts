import {
  AnalyticsApi,
  AnalyticsEvent,
  ConfigApi,
  configApiRef,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { AnalyticsImplementationBlueprint } from '@backstage/plugin-app-react';
import { JsonObject } from '@backstage/types';

import Glean from '@mozilla/glean/web';
import GleanMetrics from '@mozilla/glean/metrics';

import { create } from './metrics/backstage';

type GleanConfig = NonNullable<Parameters<typeof Glean.initialize>[2]>;

interface DebugConfig extends JsonObject {
  logging?: boolean;
  tag?: string;
}

export class GleanAnalytics implements AnalyticsApi {
  private constructor(
    appId: string,
    enabled: boolean,
    gleanConfig: GleanConfig,
    debug?: DebugConfig,
  ) {
    if (debug) {
      Glean.setLogPings(!!debug.logging);
      if (debug.tag) {
        Glean.setDebugViewTag(debug.tag);
      }
    }
    Glean.initialize(appId, enabled, gleanConfig);
  }

  static fromConfig(config: ConfigApi): GleanAnalytics {
    const appId = config.getString('app.analytics.glean.appId');
    const enabled = config.getBoolean('app.analytics.glean.enabled');
    const debug = config.getOptional<DebugConfig>('app.analytics.glean.debug');
    const environment = config.getString('app.analytics.glean.environment');

    return new GleanAnalytics(
      appId,
      enabled,
      {
        enableAutoPageLoadEvents: false,
        enableAutoElementClickEvents: false,
        channel: environment,
      },
      debug,
    );
  }

  captureEvent(event: AnalyticsEvent) {
    const { action, subject } = event;
    switch (action) {
      case 'navigate':
        GleanMetrics.pageLoad({
          title: subject,
          url: window.location.toString(),
          referrer: document.referrer,
        });
        break;
      case 'click':
        GleanMetrics.recordElementClick({
          id: event.attributes?.to.toString(),
          label: subject,
        });
        break;
      case 'create':
        create.record({
          name: subject,
          entity_ref: event.attributes?.entityRef.toString(),
          time_saved: event.value,
        });
        break;
      default:
        break;
    }
  }
}

const gleanAnalytics = AnalyticsImplementationBlueprint.make({
  name: 'glean',
  params: defineParams =>
    defineParams({
      deps: { configApi: configApiRef },
      factory: ({ configApi }) => GleanAnalytics.fromConfig(configApi),
    }),
});

export const gleanPlugin = createFrontendPlugin({
  pluginId: 'glean',
  extensions: [gleanAnalytics],
});

export default gleanPlugin;
