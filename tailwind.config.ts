import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * Tema unificado de AeroGestion UNS.
 *
 * Generado por merging de los dos <script id="tailwind-config"> originales
 * (login.html y vuelos.html). Los tokens que tenian VALORES DISTINTOS en cada
 * pagina no se pueden fijar aca porque AMBAS paginas los usan; por eso se
 * declaran como custom properties con fallback y cada pagina las sobreescribe
 * en su propio scope (.theme-login / .theme-vuelos, ver globals.css).
 *
 * De ese modo ambas paginas conservan EXACTAMENTE el diseno original.
 */
const varColor = (name: string, fallback: string) => `var(--ag-color-${name}, ${fallback})`;

/** Tupla de fontSize de Tailwind: [size, { lineHeight, fontWeight, letterSpacing }]. */
type FontSizeTuple = [
  string,
  { lineHeight?: string; letterSpacing?: string; fontWeight?: string | number },
];

const size = (
  fontSize: string,
  lineHeight: string,
  fontWeight?: string | number,
  letterSpacing?: string,
): FontSizeTuple => {
  const cfg: FontSizeTuple[1] = { lineHeight };
  if (fontWeight !== undefined) cfg.fontWeight = fontWeight;
  if (letterSpacing !== undefined) cfg.letterSpacing = letterSpacing;
  return [fontSize, cfg];
};

const SANS_STACK = [
  'Plus Jakarta Sans',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  'sans-serif',
];

const MONO_STACK = [
  'Space Grotesk',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'monospace',
];

const theme = {
  colors: {
    background: varColor('background', '#f8fafc'),
    error: '#ba1a1a',
    'error-container': '#ffdad6',
    'inverse-on-surface': '#eaf1ff',
    'inverse-primary': '#d1bcff',
    'inverse-surface': '#213145',
    'on-background': '#0b1c30',
    'on-error': '#ffffff',
    'on-error-container': '#93000a',
    'on-primary': '#ffffff',
    'on-primary-container': '#987ed4',
    'on-primary-fixed': '#24005b',
    'on-primary-fixed-variant': '#503788',
    'on-secondary': '#ffffff',
    'on-secondary-container': '#fffbff',
    'on-secondary-fixed': '#40000c',
    'on-secondary-fixed-variant': '#920028',
    'on-surface': '#0b1c30',
    'on-surface-variant': '#494550',
    'on-tertiary': '#ffffff',
    'on-tertiary-container': '#2b94d7',
    'on-tertiary-fixed': '#001d31',
    'on-tertiary-fixed-variant': '#004b73',
    outline: '#7a7582',
    'outline-variant': '#cbc4d2',
    primary: '#170040',
    'primary-container': '#2e1065',
    'primary-fixed-dim': '#d1bcff',
    secondary: varColor('secondary', '#e11d48'),
    'secondary-container': '#e21e49',
    'secondary-fixed': '#ffdada',
    'secondary-fixed-dim': '#ffb3b6',
    surface: varColor('surface', '#f8fafc'),
    'surface-bright': '#f8f9ff',
    'surface-container': '#e5eeff',
    'surface-container-high': '#dce9ff',
    'surface-container-highest': '#d3e4fe',
    'surface-container-low': '#eff4ff',
    'surface-container-lowest': '#ffffff',
    'surface-dim': '#cbdbf5',
    'surface-tint': '#6950a2',
    'surface-variant': '#d3e4fe',
    tertiary: '#001221',
    'tertiary-container': '#002841',
    'tertiary-fixed': '#cce5ff',
    'tertiary-fixed-dim': '#93ccff',
  },
  fontFamily: {
    'body-lg': SANS_STACK,
    'body-md': SANS_STACK,
    'body-sm': SANS_STACK,
    'code-flight': SANS_STACK,
    'code-telemetry': MONO_STACK,
    'display-lg': SANS_STACK,
    'display-lg-mobile': SANS_STACK,
    'headline-lg': SANS_STACK,
    'headline-lg-mobile': SANS_STACK,
    'headline-md': SANS_STACK,
    'headline-sm': SANS_STACK,
    'headline-xl': SANS_STACK,
    'headline-xl-mobile': SANS_STACK,
    'label-lg': SANS_STACK,
    'label-md': SANS_STACK,
    'label-sm': SANS_STACK,
  },
  fontSize: {
    // --- tokens identicos en ambas paginas ---
    'code-flight': size('13px', '18px', '700', '0.08em'),
    'code-telemetry': size('13px', '18px', '600', '0.05em'),
    'display-lg': size('44px', '52px', '800', '-0.03em'),
    'display-lg-mobile': size('32px', '40px', '800', '-0.02em'),
    'headline-lg-mobile': size('24px', '32px', '700', '-0.01em'),
    'label-lg': size('14px', '20px', '600', '0.01em'),
    'label-md': size('12px', '16px', '600', '0.02em'),
    'label-sm': size('11px', '14px', '700', '0.04em'),

    // --- tokens con valores distintos por pagina -> CSS vars ---
    'body-lg': size(
      'var(--ag-fs-body-lg-size, 16px)',
      'var(--ag-fs-body-lg-lh, 26px)',
      'var(--ag-fs-body-lg-fw, 400)',
    ),
    'body-md': size(
      'var(--ag-fs-body-md-size, 14px)',
      'var(--ag-fs-body-md-lh, 22px)',
      'var(--ag-fs-body-md-fw, 400)',
    ),
    'body-sm': size(
      'var(--ag-fs-body-sm-size, 12px)',
      'var(--ag-fs-body-sm-lh, 18px)',
      'var(--ag-fs-body-sm-fw, 400)',
    ),
    'headline-lg': size(
      'var(--ag-fs-headline-lg-size, 24px)',
      'var(--ag-fs-headline-lg-lh, 32px)',
      'var(--ag-fs-headline-lg-fw, 700)',
      'var(--ag-fs-headline-lg-ls, -0.015em)',
    ),
    'headline-md': size(
      'var(--ag-fs-headline-md-size, 20px)',
      'var(--ag-fs-headline-md-lh, 28px)',
      'var(--ag-fs-headline-md-fw, 600)',
      'var(--ag-fs-headline-md-ls, -0.01em)',
    ),
    'headline-sm': size(
      'var(--ag-fs-headline-sm-size, 16px)',
      'var(--ag-fs-headline-sm-lh, 24px)',
      'var(--ag-fs-headline-sm-fw, 600)',
      'var(--ag-fs-headline-sm-ls, -0.005em)',
    ),
    'headline-xl': size(
      'var(--ag-fs-headline-xl-size, 32px)',
      'var(--ag-fs-headline-xl-lh, 40px)',
      'var(--ag-fs-headline-xl-fw, 700)',
      'var(--ag-fs-headline-xl-ls, -0.02em)',
    ),
    'headline-xl-mobile': size(
      'var(--ag-fs-headline-xl-mobile-size, 26px)',
      'var(--ag-fs-headline-xl-mobile-lh, 34px)',
      'var(--ag-fs-headline-xl-mobile-fw, 700)',
      'var(--ag-fs-headline-xl-mobile-ls, -0.015em)',
    ),
  },
  borderRadius: {
    DEFAULT: '0.25rem',
    full: '9999px',
    lg: '0.5rem',
    xl: '0.75rem',
  },
  spacing: {
    gutter: 'var(--ag-spacing-gutter, 1.25rem)',
    'gutter-mobile': '0.75rem',
    'gutter-sm': '1rem',
    margin: '2rem',
    'margin-mobile': '1rem',
    'margin-sm': '1rem',
    'space-lg': '1.5rem',
    'space-md': '1rem',
    'space-sm': '0.5rem',
    'space-xl': 'var(--ag-spacing-space-xl, 2rem)',
    'space-xs': '0.25rem',
  },
};

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: theme,
  },
  // Necesario para reproducir el render original de los <input> del login
  // (el HTML original lo cargaba via `tailwind.config?plugins=forms`).
  plugins: [forms],
};

export default config;
