import {
  ApiBlueprint,
  configApiRef,
  analyticsApiRef,
  AnalyticsApi,
} from '@backstage/frontend-plugin-api';
import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';
import { GleanAnalytics } from 'backstage-plugin-glean';

export const scmIntegrationsApi = ApiBlueprint.make({
  name: 'scm-integrations',
  params: defineParams =>
    defineParams({
      api: scmIntegrationsApiRef,
      deps: { configApi: configApiRef },
      factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
    }),
});

export const scmAuthApi = ApiBlueprint.make({
  name: 'scm-auth',
  params: defineParams => defineParams(ScmAuth.createDefaultApiFactory()),
});

export const gleanAnalyticsApi = ApiBlueprint.make({
  name: 'glean-analytics',
  params: defineParams =>
    defineParams({
      api: analyticsApiRef,
      deps: { configApi: configApiRef },
      factory: ({ configApi }) =>
        GleanAnalytics.fromConfig(configApi) as unknown as AnalyticsApi,
    }),
});
