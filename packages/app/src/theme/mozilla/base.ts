import {
  defaultTypography,
  pageTheme as defaultPageThemes,
  PageTheme,
  shapes,
  genPageTheme,
  UnifiedThemeOptions,
  BackstageTypography,
} from '@backstage/theme';

/**
 * Mozilla brand colors from https://brand.mozilla.com/document/231#/-/color.
 * Shared theme inputs (colors, typography, page-themes, MUI component
 * overrides). `./light` and `./dark` consume these to build the actual
 * themes; `./index` is a thin barrel that re-exports everything. Keeping
 * the inputs here (not in `./index`) avoids the TDZ-ReferenceError that
 * arises if a barrel re-exports children which in turn import from it.
 *
 * Brand color values are mirrored as literals in `./mozilla.css`.
 *
 * Per the brand guide:
 *   - Page backgrounds use `white` / `black`. The `strong` variants are
 *     typography-only (do NOT background with strong-white/strong-black).
 *   - Tertiary palette (aqua/seed/grey/clay) is data-viz only. Greys
 *     here are a knowing deviation for borders / muted text / elevated
 *     dark surfaces — the brand provides no neutral midtones outside
 *     the data-viz palette.
 */
export const moz = {
  white: '#fafafa', //   primary white     — page bg (light)
  strongWhite: '#ffffff', // primary strong   — typography on dark / card surface
  black: '#161616', //   primary black     — page bg (dark)
  strongBlack: '#000000', // primary strong — typography on light / text on green
  green: '#00d230', //   accent / CTA / brand mark
  greenPlus1: '#d6ffcd', //   pale green (success surface)
  greenMinus1: '#28733f', //  deep green (hover, success-strong)
  greenMinus2: '#022611', //  deepest green (dark hero)
  orange: '#ff9456', //  warning
  orangeMinus1: '#ff453f', //  error / strong warning
  pinkMinus1: '#ae49ec', //  violet — info accent
  grey1: '#e8e8e8', //   light border / divider
  grey: '#b3b3b3', //    muted text on dark
  greyMinus1: '#6d6d6d', //  muted text on light
  greyMinus2: '#414141', //  raised surface (dark) / border (dark)
} as const;

const HEADING_FONT = '"Mozilla Text", Helvetica, Arial, sans-serif';

/**
 * Mozilla typography. Body inherits the Backstage default (Helvetica/system),
 * headings use Mozilla Text loaded via the @import in `mozilla.css`.
 * Slightly heavier h1/h2 to lean into the brand's bold display style.
 */
export const mozillaTypography: BackstageTypography = {
  ...defaultTypography,
  h1: {
    ...defaultTypography.h1,
    fontFamily: HEADING_FONT,
    fontSize: 48,
    fontWeight: 900,
  },
  h2: {
    ...defaultTypography.h2,
    fontFamily: HEADING_FONT,
    fontSize: 36,
    fontWeight: 700,
  },
  h3: { ...defaultTypography.h3, fontFamily: HEADING_FONT, fontWeight: 700 },
  h4: { ...defaultTypography.h4, fontFamily: HEADING_FONT, fontWeight: 700 },
  h5: { ...defaultTypography.h5, fontFamily: HEADING_FONT, fontWeight: 700 },
  h6: { ...defaultTypography.h6, fontFamily: HEADING_FONT, fontWeight: 700 },
};

/**
 * Page-theme override. Backstage ships colorful gradients per route
 * (home/tool/service/etc.) — those are not Mozilla brand colors, so we
 * flatten them to a brand-aligned solid and force the header fontColor.
 *
 * Pass `fontColor` matching the current mode (strong-black on light,
 * strong-white on dark).
 */
export function mozPageThemes(
  fontColor: string,
  backgroundColors: string[],
): Record<string, PageTheme> {
  const out: Record<string, PageTheme> = {};
  for (const key of Object.keys(defaultPageThemes)) {
    out[key] = {
      ...defaultPageThemes[key],
      ...genPageTheme({
        colors: backgroundColors,
        shape: shapes.square,
        options: { fontColor },
      }),
    };
  }
  return out;
}

/**
 * MUI component overrides shared by both Mozilla themes. All references
 * to color go through `theme.palette` so the same definitions render
 * correctly in light and dark mode.
 */
export const mozillaComponents: UnifiedThemeOptions['components'] = {
  BackstageHeader: {
    styleOverrides: {
      header: ({ theme }) => ({
        // backgroundImage: 'unset',
        // boxShadow: 'unset',
        paddingBottom: theme.spacing(2),
      }),
      title: ({ theme }) => ({
        color: theme.page.fontColor,
        fontFamily: HEADING_FONT,
        fontWeight: 700,
      }),
      subtitle: ({ theme }) => ({ color: theme.page.fontColor, opacity: 1 }),
      type: ({ theme }) => ({ color: theme.page.fontColor, opacity: 1 }),
    },
  },
  BackstageHeaderTabs: {
    styleOverrides: {
      defaultTab: { fontSize: 'inherit', textTransform: 'none' },
    },
  },
  BackstageOpenedDropdown: {
    styleOverrides: {
      icon: { '& path': { fill: 'currentColor' } },
    },
  },
  // Match BUI Card's flat aesthetic: no border, no shadow, 8px radius.
  // BUI cards separate from the page via `--bui-bg-neutral-1` (#fff) vs
  // `--bui-bg-app` (#fafafa) — MUI Paper does the same via `palette.
  // background.paper` vs `background.default`, so dropping the shadow
  // is enough to match. Internal hairlines use `palette.divider`.
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: 'unset', boxShadow: 'none' },
      // Menus / popovers still want their default shadow so they read
      // as floating rather than blending into the page underneath.
      elevation8: { boxShadow: undefined },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: { borderRadius: 8 },
    },
  },
  BackstageTable: {
    styleOverrides: {
      root: ({ theme }) => ({
        '&> :first-child': {
          borderBottom: `1px solid ${theme.palette.divider}`,
          boxShadow: 'none',
        },
        '& th': { borderTop: 'none', textTransform: 'none !important' },
      }),
    },
  },
  CatalogReactUserListPicker: {
    styleOverrides: { title: { textTransform: 'none' } },
  },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: 8 },
      // Brand says no colored text — alerts are an exception (status
      // signaling is part of accessibility, not "colored text" in the
      // brand sense). Use the AAA-tested pairings: strong-black on
      // green/orange/pink, strong-white on the deepest greens.
      standardError: ({ theme }) => ({
        backgroundColor: theme.palette.error.main,
        color: moz.strongWhite,
        '& .MuiAlert-icon': { color: moz.strongWhite },
      }),
      standardWarning: ({ theme }) => ({
        backgroundColor: theme.palette.warning.main,
        color: moz.strongBlack,
        '& .MuiAlert-icon': { color: moz.strongBlack },
      }),
      standardSuccess: ({ theme }) => ({
        backgroundColor: theme.palette.success.main,
        color: moz.strongBlack,
        '& .MuiAlert-icon': { color: moz.strongBlack },
      }),
      standardInfo: ({ theme }) => ({
        backgroundColor: theme.palette.info.main,
        color: moz.strongWhite,
        '& .MuiAlert-icon': { color: moz.strongWhite },
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: { borderRadius: 8, textTransform: 'none', fontWeight: 600 },
      contained: { boxShadow: 'none' },
      // Brand's primary call-to-action: green button with strong-black
      // text per the AAA pair "Green on Black" (also reads as "Strong
      // Black on Green" inverted). Hover deepens to green -1.
      containedPrimary: ({ theme }) => ({
        backgroundColor: theme.palette.primary.main,
        color: moz.strongBlack,
        '&:hover': { backgroundColor: moz.greenMinus1, color: moz.strongWhite },
      }),
      outlined: ({ theme }) => ({
        borderColor: theme.palette.text.primary,
        color: theme.palette.text.primary,
        '&:hover': {
          borderColor: moz.green,
          color: theme.palette.text.primary,
        },
      }),
    },
  },
  MuiChip: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 8,
        backgroundColor:
          theme.palette.mode === 'dark' ? moz.greyMinus2 : moz.grey1,
        color: theme.palette.text.primary,
        fontWeight: 500,
      }),
      outlined: ({ theme }) => ({
        backgroundColor: 'transparent',
        borderColor: theme.palette.divider,
      }),
      clickable: {
        '&:hover, &:focus': {
          backgroundColor: moz.green,
          color: moz.strongBlack,
        },
      },
    },
  },
  MuiLink: {
    styleOverrides: {
      // Brand guide: "Don't use colored text". Links stay strong-
      // black/strong-white with an underline; the green only appears on
      // hover as a brand cue.
      root: ({ theme }) => ({
        color: theme.palette.link,
        textDecoration: 'underline',
        textUnderlineOffset: 1,
        '&:hover': {
          color: theme.palette.linkHover,
          textDecorationThickness: 2,
        },
      }),
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: ({ theme }) => ({
        backgroundColor: theme.palette.primary.main,
        transition: 'none',
        height: 3,
      }),
    },
  },
  MuiTab: {
    styleOverrides: {
      root: { textTransform: 'none', fontWeight: 600 },
    },
  },
  MuiTypography: {
    styleOverrides: { button: { textTransform: 'none' } },
  },
};
