import { AppRootElementBlueprint } from '@backstage/frontend-plugin-api';
import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';

export const alertDisplayElement = AppRootElementBlueprint.make({
  name: 'alert-display',
  params: { element: <AlertDisplay /> },
});

export const oauthRequestDialogElement = AppRootElementBlueprint.make({
  name: 'oauth-request-dialog',
  params: { element: <OAuthRequestDialog /> },
});
