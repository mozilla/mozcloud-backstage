import { configApiRef, useApi } from '@backstage/core-plugin-api';

import {
  AppRootElementBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';

import {
  AlertDisplay,
  IdentityProviders,
  OAuthRequestDialog,
  ProxiedSignInPage,
  SignInPage,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import {
  SignInPageBlueprint,
  ThemeBlueprint,
  IconBundleBlueprint,
} from '@backstage/plugin-app-react';
import { UnifiedThemeProvider } from '@backstage/theme';
import LightIcon from '@material-ui/icons/WbSunny';
import DarkIcon from '@material-ui/icons/Brightness2';
import { Sidebar } from '../components/Root';
import {
  scmAuthApi,
  scmIntegrationsApi,
  auth0AuthApiRef,
  auth0Auth,
} from '../apis';
import { mozillaDarkTheme, mozillaLightTheme } from '../theme/mozilla';
import { GitHubIcon, DawgIcon } from '../components/icons';

const signInPageExtension = SignInPageBlueprint.make({
  params: {
    loader: async () => props => {
      const configApi = useApi(configApiRef);
      const env = configApi.getOptionalString('auth.environment');
      const providers: IdentityProviders = [];
      if (env === 'dev' || env === 'development') {
        providers.push('guest');
      } else {
        providers.push({
          id: 'auth0',
          title: 'Mozilla Auth0',
          message: 'Signing with Mozilla SSO',
          apiRef: auth0AuthApiRef,
        });
      }

      return <SignInPage {...props} providers={providers} />;
      // return <ProxiedSignInPage {...props} provider="gcpIap" />;
    },
  },
});

const mozcloudIcons = IconBundleBlueprint.make({
  name: 'mozcloud',
  params: {
    icons: {
      github: GitHubIcon,
      dawg: <DawgIcon width="1em" height="1em" />,
    },
  },
});

const sidebarExtension = NavContentBlueprint.make({
  params: { component: () => <Sidebar /> },
});

const alertDisplayElement = AppRootElementBlueprint.make({
  name: 'alert-display',
  params: { element: <AlertDisplay /> },
});

const oauthRequestDialogElement = AppRootElementBlueprint.make({
  name: 'oauth-request-dialog',
  params: { element: <OAuthRequestDialog /> },
});

const lightThemeExtension = ThemeBlueprint.make({
  name: 'light',
  params: {
    theme: {
      id: 'light',
      title: 'Mozilla Light',
      variant: 'light',
      icon: <LightIcon />,
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={mozillaLightTheme} children={children} />
      ),
    },
  },
});

const darkThemeExtension = ThemeBlueprint.make({
  name: 'dark',
  params: {
    theme: {
      id: 'dark',
      title: 'Mozilla Dark',
      variant: 'dark',
      icon: <DarkIcon />,
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={mozillaDarkTheme} children={children} />
      ),
    },
  },
});

/**
 * App-wide overrides. Anything that attaches to the `app` plugin's
 * extension points (APIs, sign-in page, sidebar, root elements, themes)
 * goes here. Pure components live under `../components/`.
 */
export const appModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    scmIntegrationsApi,
    scmAuthApi,
    auth0Auth,
    signInPageExtension,
    sidebarExtension,
    alertDisplayElement,
    oauthRequestDialogElement,
    lightThemeExtension,
    darkThemeExtension,
    mozcloudIcons,
  ],
});
