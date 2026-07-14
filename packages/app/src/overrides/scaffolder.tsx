import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { configApiRef, githubAuthApiRef } from '@backstage/core-plugin-api';
import {
  FormDecoratorBlueprint,
  createScaffolderFormDecorator,
} from '@backstage/plugin-scaffolder-react/alpha';

/**
 * Obtains the initiating user's GitHub token at form-submit time and stashes it
 * as `USER_OAUTH_TOKEN`, so the create-tenant-chart steps author their PRs as
 * that user.
 *
 * This is gated on the `scaffolder.githubUserAuth` config flag, which is set in
 * stage/prod but left unset in local development. When it's off we skip the
 * `getAccessToken` call entirely — so no GitHub sign-in popup appears locally —
 * and the backend steps fall back to the integration token. When it's on,
 * `getAccessToken` initiates the sign-in flow (form submit is a user gesture,
 * so the popup is allowed) and the resulting token is used for the PRs.
 */
const githubAuthDecorator = createScaffolderFormDecorator({
  id: 'mozcloud:github-auth',
  deps: { githubApi: githubAuthApiRef, config: configApiRef },
  decorator: async ({ setSecrets }, { githubApi, config }) => {
    if (!config.getOptionalBoolean('scaffolder.githubUserAuth')) {
      return;
    }
    const token = await githubApi.getAccessToken(['repo']);
    if (token) {
      setSecrets(secrets => ({ ...secrets, USER_OAUTH_TOKEN: token }));
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
