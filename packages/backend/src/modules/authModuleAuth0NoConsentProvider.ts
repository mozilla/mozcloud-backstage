import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  commonSignInResolvers,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { createAuth0Authenticator } from '@backstage/plugin-auth-backend-module-auth0-provider';

/**
 * Custom Auth0 auth provider module — registers provider id `auth0`, replacing
 * the stock `@backstage/plugin-auth-backend-module-auth0-provider`.
 *
 * It is identical to the stock module except that the authorize request omits
 * `prompt=consent`. The stock authenticator hardcodes `prompt: 'consent'` in
 * its `start()` (see node_modules/.../auth0-provider/dist/authenticator.cjs.js),
 * which forces Auth0 to display the consent screen on every sign-in — even for
 * first-party applications that would otherwise skip it. (Reference: Mozilla's
 * Harbor OIDC integration is first-party and requests the same scopes —
 * `openid email offline_access` — yet shows no consent screen, because it does
 * not send `prompt=consent`.)
 *
 * The refresh token comes from the `offline_access` scope requested by the
 * frontend OAuth2 client, not from `prompt=consent`, so session persistence
 * across page reloads is unaffected by this change. (`accessType: 'offline'` is
 * a Google-ism that Auth0 ignores; it is retained only to match the stock
 * authenticator's request exactly.)
 *
 * NOTE: for Auth0 to issue the refresh token without prompting, the Backstage
 * Auth0 application must be registered as first-party. Otherwise Auth0 will
 * still show consent on first sign-in regardless of this module.
 */
export const authModuleAuth0NoConsentProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'auth0-no-consent-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
        cache: coreServices.cache,
      },
      async init({ providers, cache }) {
        const base = createAuth0Authenticator({ cache });

        const authenticator: typeof base = {
          ...base,
          // Same as the stock authenticator's start(), minus `prompt: 'consent'`.
          async start(input, ctx) {
            return ctx.helper.start(input, {
              accessType: 'offline',
              ...(ctx.audience ? { audience: ctx.audience } : {}),
              ...(ctx.connection ? { connection: ctx.connection } : {}),
              ...(ctx.connectionScope
                ? { connection_scope: ctx.connectionScope }
                : {}),
            });
          },
        };

        providers.registerProvider({
          providerId: 'auth0',
          factory: createOAuthProviderFactory({
            authenticator,
            signInResolverFactories: {
              ...commonSignInResolvers,
            },
          }),
        });
      },
    });
  },
});

export default authModuleAuth0NoConsentProvider;
