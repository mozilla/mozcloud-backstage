import {
  createBaseThemeOptions,
  createUnifiedTheme,
  palettes,
} from '@backstage/theme';
import {
  moz,
  mozillaComponents,
  mozillaTypography,
  mozPageThemes,
} from './base';

/**
 * Mozilla dark theme — same 45/45/10 balance as light, inverted.
 * Page bg uses `black` (#161616, not strong-black per the brand rule);
 * cards lift via `grey -2`. Typography is strong-white; the green pop
 * stays the brand mark.
 */
export const mozillaDarkTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: {
      ...palettes.dark,
      background: {
        default: moz.black,
        paper: moz.greyMinus2,
      },
      primary: {
        main: moz.green,
        dark: moz.greenMinus1,
        light: moz.greenPlus1,
      },
      secondary: { main: moz.orange, dark: moz.orangeMinus1 },
      error: {
        main: moz.orangeMinus1,
        dark: moz.orangeMinus1,
        light: moz.orange,
      },
      warning: { main: moz.orange, dark: moz.orangeMinus1, light: moz.orange },
      success: {
        main: moz.green,
        dark: moz.greenMinus1,
        light: moz.greenPlus1,
      },
      info: {
        main: moz.pinkMinus1,
        dark: moz.pinkMinus1,
        light: moz.pinkMinus1,
      },
      grey: {
        50: moz.white,
        100: moz.grey1,
        200: moz.grey1,
        300: moz.grey,
        400: moz.grey,
        500: moz.greyMinus1,
        600: moz.greyMinus1,
        700: moz.greyMinus2,
        800: moz.greyMinus2,
        900: moz.black,
      },
      text: {
        primary: moz.strongWhite,
        secondary: moz.grey,
      },
      border: moz.green,
      divider: moz.greyMinus2,
      textContrast: moz.strongWhite,
      textSubtle: moz.grey,
      link: moz.green,
      linkHover: moz.greenPlus1,
      // Sidebar uses grey -2 so it lifts off the black page bg; hover
      // bumps to grey -1 so the hover/selected state is visible against
      // the sidebar surface itself.
      navigation: {
        ...palettes.dark.navigation,
        background: moz.greyMinus2,
        color: moz.strongWhite,
        selectedColor: moz.strongWhite,
        indicator: moz.green,
        navItem: { hoverBackground: moz.greyMinus1 },
        submenu: { background: moz.greyMinus1 },
      },
      status: {
        ...palettes.dark.status,
        ok: moz.green,
        warning: moz.orange,
        error: moz.orangeMinus1,
      },
    },
  }),
  typography: mozillaTypography,
  pageTheme: mozPageThemes(moz.strongWhite, [moz.pinkMinus1]),
  defaultPageTheme: 'home',
  components: mozillaComponents,
});
