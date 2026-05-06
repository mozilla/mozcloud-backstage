import { configApiRef, useApi } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { ProxiedSignInPage, SignInPage } from '@backstage/core-components';

export const signInPageExtension = SignInPageBlueprint.make({
  params: {
    loader: async () => props => {
      const configApi = useApi(configApiRef);
      if (configApi.getOptionalString('auth.environment') === 'development') {
        return <SignInPage {...props} providers={['guest']} />;
      }
      return <ProxiedSignInPage {...props} provider="gcpIap" />;
    },
  },
});
