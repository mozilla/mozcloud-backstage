import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import {
  FormDecoratorBlueprint,
  createScaffolderFormDecorator,
} from '@backstage/plugin-scaffolder-react/alpha';

/**
 * Obtains the initiating user's GitHub token at form-submit time and stashes it
 * as `USER_OAUTH_TOKEN`, so the create-tenant-chart steps author their PRs as
 * that user.
 *
 * `getAccessToken` initiates the GitHub sign-in flow if the user isn't already
 * authorized (form submit is a user gesture, so the popup is allowed). When no
 * GitHub auth provider is configured (e.g. local dev), it throws — we swallow
 * that and leave the secret unset, so the steps fall back to the integration
 * token and `github:ensureAuth` still guards access.
 */
const githubAuthDecorator = createScaffolderFormDecorator({
  id: 'mozcloud:github-auth',
  deps: { githubApi: githubAuthApiRef },
  decorator: async ({ setSecrets }, { githubApi }) => {
    try {
      const token = await githubApi.getAccessToken(['repo']);
      if (token) {
        setSecrets(secrets => ({ ...secrets, USER_OAUTH_TOKEN: token }));
      }
    } catch {
      // No GitHub auth provider available (local dev): fall back to the
      // integration token in the backend steps.
    }
  },
});

const githubAuthDecoratorExtension = FormDecoratorBlueprint.make({
  name: 'mozcloud-github-auth',
  params: { decorator: githubAuthDecorator },
});

export const scaffolderModule = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [githubAuthDecoratorExtension],
});
