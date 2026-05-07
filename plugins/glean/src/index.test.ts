import Glean from '@mozilla/glean/web';
import GleanMetrics from '@mozilla/glean/metrics';
import { GleanAnalytics } from './index';
import { create } from './metrics/backstage';

jest.mock('@mozilla/glean/web', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    setLogPings: jest.fn(),
    setDebugViewTag: jest.fn(),
  },
}));

jest.mock('@mozilla/glean/metrics', () => ({
  __esModule: true,
  default: {
    pageLoad: jest.fn(),
    recordElementClick: jest.fn(),
  },
}));

jest.mock('./metrics/backstage', () => ({
  create: { record: jest.fn() },
}));

const makeConfig = (
  values: Record<string, unknown> = {
    'app.analytics.glean.appId': 'moz_backstage',
    'app.analytics.glean.enabled': true,
    'app.analytics.glean.environment': 'development',
  },
) =>
  ({
    getString: (k: string) => values[k] as string,
    getBoolean: (k: string) => values[k] as boolean,
    getOptional: <T>(k: string) => values[k] as T | undefined,
  } as any);

describe('GleanAnalytics.fromConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('initializes Glean with the configured appId, enabled, and channel', () => {
    GleanAnalytics.fromConfig(makeConfig());

    expect(Glean.initialize).toHaveBeenCalledWith(
      'moz_backstage',
      true,
      expect.objectContaining({
        channel: 'development',
        enableAutoPageLoadEvents: false,
        enableAutoElementClickEvents: false,
      }),
    );
  });

  it('does not configure debug logging or tag when debug config is absent', () => {
    GleanAnalytics.fromConfig(makeConfig());

    expect(Glean.setLogPings).not.toHaveBeenCalled();
    expect(Glean.setDebugViewTag).not.toHaveBeenCalled();
  });

  it('sets log pings and debug view tag when debug config is provided', () => {
    GleanAnalytics.fromConfig(
      makeConfig({
        'app.analytics.glean.appId': 'moz_backstage',
        'app.analytics.glean.enabled': true,
        'app.analytics.glean.environment': 'development',
        'app.analytics.glean.debug': { logging: true, tag: 'pr-123' },
      }),
    );

    expect(Glean.setLogPings).toHaveBeenCalledWith(true);
    expect(Glean.setDebugViewTag).toHaveBeenCalledWith('pr-123');
  });

  it('skips setDebugViewTag when only logging is configured', () => {
    GleanAnalytics.fromConfig(
      makeConfig({
        'app.analytics.glean.appId': 'moz_backstage',
        'app.analytics.glean.enabled': true,
        'app.analytics.glean.environment': 'development',
        'app.analytics.glean.debug': { logging: false },
      }),
    );

    expect(Glean.setLogPings).toHaveBeenCalledWith(false);
    expect(Glean.setDebugViewTag).not.toHaveBeenCalled();
  });
});

describe('GleanAnalytics.captureEvent', () => {
  let analytics: GleanAnalytics;

  beforeEach(() => {
    jest.clearAllMocks();
    analytics = GleanAnalytics.fromConfig(makeConfig());
  });

  it('emits a pageLoad metric on navigate events', () => {
    analytics.captureEvent({
      action: 'navigate',
      subject: 'Home Page',
    } as any);

    expect(GleanMetrics.pageLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Home Page',
        url: expect.any(String),
        referrer: expect.any(String),
      }),
    );
  });

  it('emits a recordElementClick metric on click events', () => {
    analytics.captureEvent({
      action: 'click',
      subject: 'Catalog link',
      attributes: { to: '/catalog' },
    } as any);

    expect(GleanMetrics.recordElementClick).toHaveBeenCalledWith({
      id: '/catalog',
      label: 'Catalog link',
    });
  });

  it('emits the create event metric on create actions', () => {
    analytics.captureEvent({
      action: 'create',
      subject: 'my-component',
      value: 42,
      attributes: { entityRef: 'component:default/my-component' },
    } as any);

    expect(create.record).toHaveBeenCalledWith({
      name: 'my-component',
      entity_ref: 'component:default/my-component',
      time_saved: 42,
    });
  });

  it('ignores actions that are not navigate, click, or create', () => {
    analytics.captureEvent({
      action: 'view',
      subject: 'whatever',
    } as any);

    expect(GleanMetrics.pageLoad).not.toHaveBeenCalled();
    expect(GleanMetrics.recordElementClick).not.toHaveBeenCalled();
    expect(create.record).not.toHaveBeenCalled();
  });
});
