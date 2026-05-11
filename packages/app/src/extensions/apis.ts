import { ApiBlueprint, configApiRef } from '@backstage/frontend-plugin-api';
import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';

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
