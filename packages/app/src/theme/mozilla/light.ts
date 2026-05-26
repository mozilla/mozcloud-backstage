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
 * Mozilla light theme — the canonical "Primary" expression from the
 * brand guide: ~45% black, ~45% white, ~10% green pop. Black and white
 * carry typography; green is reserved for primary CTAs / indicators.
 *
 * Page header: solid `white` background with strong-black title (brand
 * tip: "when in doubt, use black and white").
 */
export const mozillaLightTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: {
      ...palettes.light,
      background: {
        default: moz.white,
        paper: moz.strongWhite,
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
        primary: moz.strongBlack,
        secondary: moz.greyMinus1,
      },
      border: moz.grey1,
      // `palette.divider` is what MUI uses for borders; keep it in
      // lockstep with BUI `--bui-border-1` so cards from both libraries
      // share the same edge.
      divider: moz.grey1,
      textContrast: moz.strongBlack,
      textSubtle: moz.greyMinus1,
      link: moz.greenMinus1,
      linkHover: moz.greenMinus2,
      navigation: {
        ...palettes.light.navigation,
        background: moz.white,
        color: moz.strongBlack,
        selectedColor: moz.greenMinus1,
        indicator: moz.green,
        navItem: { hoverBackground: moz.green },
        submenu: { background: moz.grey1 },
      },
      status: {
        ...palettes.light.status,
        ok: moz.green,
        warning: moz.orange,
        error: moz.orangeMinus1,
      },
    },
  }),
  typography: mozillaTypography,
  pageTheme: mozPageThemes(moz.strongBlack, [moz.greenPlus1]),
  defaultPageTheme: 'home',
  components: mozillaComponents,
});
