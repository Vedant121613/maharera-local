import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * DESIGN TOKENS
 * -------------
 * Palette: a deep ledger-teal (#173F3C family) as the single working
 * accent, set against a cool paper-gray surface — not the common
 * "cream + terracotta" or "near-black + neon" admin-dashboard defaults.
 * The intent is a register-of-record feel appropriate for a
 * government-data / research tool: restrained, legible, unhurried.
 *
 * Type: IBM Plex Sans for headings/labels (technical, engineered), Inter
 * for body copy, IBM Plex Mono for IDs/numeric data — so RERA IDs,
 * counts, and progress figures read distinctly from prose.
 */

const teal: MantineColorsTuple = [
  '#e8f1f0',
  '#cfe1df',
  '#a3c6c2',
  '#74a9a3',
  '#4d9089',
  '#337f77',
  '#22766d', // primary
  '#12645b',
  '#0a534b',
  '#00443c',
];

export const theme = createTheme({
  primaryColor: 'teal',
  colors: { teal },
  primaryShade: 6,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace',
  headings: {
    fontFamily: '"IBM Plex Sans", Inter, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'sm',
  radius: { xs: '3px', sm: '5px', md: '7px', lg: '9px', xl: '12px' },
  shadows: {
    xs: '0 1px 2px rgba(16, 24, 32, 0.06)',
    sm: '0 1px 3px rgba(16, 24, 32, 0.08)',
    md: '0 4px 12px rgba(16, 24, 32, 0.10)',
  },
  black: '#14181C',
  white: '#FFFFFF',
  components: {
    Card: {
      defaultProps: { withBorder: true },
    },
    Paper: {
      defaultProps: { withBorder: true },
    },
    Table: {
      defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md' },
    },
  },
});

export const STATUS_COLORS: Record<string, string> = {
  pending: 'gray',
  running: 'teal',
  paused: 'yellow',
  completed: 'green',
  stopped: 'dark',
  failed: 'red',
  active: 'teal',
  inactive: 'gray',
  error: 'red',
};
