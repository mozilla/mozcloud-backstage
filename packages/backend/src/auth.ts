import { createBackendModule } from '@backstage/backend-plugin-api';
import { gcpIapAuthenticator } from '@backstage/plugin-auth-backend-module-gcp-iap-provider';
import {
  authProvidersExtensionPoint,
  createProxyAuthProviderFactory,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import {
  stringifyEntityRef,
  DEFAULT_NAMESPACE,
} from '@backstage/catalog-model';
import { GcpIapResult } from '@backstage/plugin-auth-backend-module-gcp-iap-provider';

const ALLOWED_DOMAIN = /^(firefox\.gcp\.)?mozilla\.com$/;

export const gcpIapSignInResolver: SignInResolver<GcpIapResult> = async (
  info,
  ctx,
) => {
  const {
    profile: { email },
  } = info;

  if (!email) {
    throw new Error('User profile contained no email');
  }

  const [name, domain] = email.split('@');
  if (!domain || !ALLOWED_DOMAIN.test(domain)) {
    throw new Error(
      `Login failed, this email ${email} does not belong to the expected domain`,
    );
  }

  try {
    return await ctx.signInWithCatalogUser({ entityRef: { name } });
  } catch (_) {
    const userEntity = stringifyEntityRef({
      kind: 'User',
      name,
      namespace: DEFAULT_NAMESPACE,
    });

    return ctx.issueToken({
      claims: {
        sub: userEntity,
        ent: [userEntity],
      },
    });
  }
};

export const gcpIapCustomAuthProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'custom-gcp-iap-auth-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'gcpIap',
          factory: createProxyAuthProviderFactory({
            authenticator: gcpIapAuthenticator,
            signInResolver: gcpIapSignInResolver,
          }),
        });
      },
    });
  },
});
