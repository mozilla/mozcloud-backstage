import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { HomePageLayoutBlueprint } from '@backstage/plugin-home-react/alpha';
import { HomePage } from '../components/home/HomePage';

const homePageLayout = HomePageLayoutBlueprint.make({
  params: {
    loader: async () => HomePage,
  },
});

/**
 * Overrides for the home plugin. Mounts our `HomePage` as the layout
 * for the home page route (configured in app-config.yaml to live at `/`).
 */
export const homeModule = createFrontendModule({
  pluginId: 'home',
  extensions: [homePageLayout],
});
