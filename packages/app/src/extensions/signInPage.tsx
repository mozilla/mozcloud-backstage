import { configApiRef, useApi } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { ProxiedSignInPage, SignInPage } from '@backstage/core-components';

export const signInPageExtension = SignInPageBlueprint.make({
  params: {
    loader: async () => props => {
      const configApi = useApi(configApiRef);
      // Accept both values main has used historically: 'dev' for local,
      // 'development' for the older convention.
      const env = configApi.getOptionalString('auth.environment');
      if (env === 'dev' || env === 'development') {
        return <SignInPage {...props} providers={['guest']} />;
      }
      return <ProxiedSignInPage {...props} provider="gcpIap" />;
    },
  },
});
