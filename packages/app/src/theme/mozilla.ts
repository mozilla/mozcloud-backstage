import {
  createBaseThemeOptions,
  createUnifiedTheme,
  defaultTypography,
  palettes,
} from '@backstage/theme';

// Mozilla Text is loaded via @import in styles.css.
const HEADING_FONT =
  '"Mozilla Text", Helvetica, Arial, sans-serif';

const headingTypography = {
  ...defaultTypography,
  h1: { ...defaultTypography.h1, fontFamily: HEADING_FONT },
  h2: { ...defaultTypography.h2, fontFamily: HEADING_FONT },
  h3: { ...defaultTypography.h3, fontFamily: HEADING_FONT },
  h4: { ...defaultTypography.h4, fontFamily: HEADING_FONT },
  h5: { ...defaultTypography.h5, fontFamily: HEADING_FONT },
  h6: { ...defaultTypography.h6, fontFamily: HEADING_FONT },
};

/**
 * MUI theme overrides for the moz-backstage-app.
 *
 * Most current Backstage cards (`InfoCard`, the catalog entity page,
 * Page/Header gradients) still render through the legacy MUI runtime
 * and read from this palette. Stock `palettes.dark` puts cards at
 * roughly the same lightness as the page background, so cards "bleed"
 * into the surrounding canvas. We override `background.default` and
 * `background.paper` to a pair that visibly separates surface layers
 * (matches the lift you see on demo.backstage.io).
 *
 * Backstage UI (BUI) components — `MembersListCard`, search results,
 * the new avatars — don't read from this palette. They're themed via
 * CSS custom properties in `styles.css` instead.
 */
export const mozillaLightTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: palettes.light,
    typography: headingTypography,
  }),
  defaultPageTheme: 'home',
});

export const mozillaDarkTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: {
      ...palettes.dark,
      background: {
        default: '#1f2127',
        paper: '#2a2d33',
      },
    },
    typography: headingTypography,
  }),
  defaultPageTheme: 'home',
});
