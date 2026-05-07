import {
  AnalyticsApi,
  AnalyticsEvent,
  AnyApiFactory,
  ConfigApi,
  analyticsApiRef,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';

import Glean from '@mozilla/glean/web';
import GleanMetrics from '@mozilla/glean/metrics';
import { JsonObject } from '@backstage/types';
import { create } from './metrics/backstage';

// The Glean web entry exposes initialize but not the standalone
// ConfigurationInterface; derive it from the parameter signature.
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
    const debug = config.getOptional(
      'app.analytics.glean.debug',
    ) as DebugConfig;
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

export const createGleanApiFactory: () => AnyApiFactory = () =>
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => GleanAnalytics.fromConfig(configApi),
  });
