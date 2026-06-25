import {
  ApiBlueprint,
  configApiRef,
  createApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type BackstageIdentityApi,
  type SessionApi,
} from '@backstage/frontend-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';

/**
 * Auth0 isn't a built-in Backstage provider, so there's no
 * `auth0AuthApiRef` in `@backstage/core-plugin-api` — we define our own,
 * backed by the generic {@link OAuth2} client. `provider.id` must match the
 * backend `@backstage/plugin-auth-backend-module-auth0-provider` (id `auth0`).
 */
export const auth0AuthApiRef = createApiRef<
  OAuthApi &
    OpenIdConnectApi &
    ProfileInfoApi &
    BackstageIdentityApi &
    SessionApi
>({ id: 'internal.auth.auth0' });

export const auth0Auth = ApiBlueprint.make({
  name: 'auth0-auth',
  params: defineParams =>
    defineParams({
      api: auth0AuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
        OAuth2.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
          provider: {
            id: 'auth0',
            title: 'Mozilla Auth0',
            icon: () => null,
          },
          environment: configApi.getOptionalString('auth.environment'),
          defaultScopes: ['openid', 'email', 'offline_access'],
        }),
    }),
});

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
