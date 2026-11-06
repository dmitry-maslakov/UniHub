import { createTheme, type MantineColorsTuple } from '@mantine/core';

// The look (DESIGN.md): one restrained petrol accent over cool neutral
// grays, Onest throughout, an 8 px rhythm and few borders.

// petrol, oklch hue 200 from L 0.97 to 0.37
const petrol: MantineColorsTuple = [
  '#ecf8f8',
  '#d6edee',
  '#b3dee0',
  '#88c8cb',
  '#5fb1b5',
  '#37999f',
  '#158388',
  '#006e73',
  '#005c60',
  '#004a4d',
];

// neutrals tinted toward the accent (chroma 0.006): light mode's
const gray: MantineColorsTuple = [
  '#f6fbfc',
  '#eff5f5',
  '#e3e9e9',
  '#d3d9d9',
  '#b9bfbf',
  '#9aa0a0',
  '#717676',
  '#525656',
  '#2a2f2f',
  '#171b1c',
];

// and dark mode's: 0 the text, 7 the page
const dark: MantineColorsTuple = [
  '#e3e9e9',
  '#cdd2d2',
  '#a7acac',
  '#828787',
  '#525656',
  '#323637',
  '#232728',
  '#161a1a',
  '#101414',
  '#090d0d',
];

const font = "'Onest Variable', ui-sans-serif, system-ui, sans-serif";

export const theme = createTheme({
  colors: { petrol, gray, dark },
  primaryColor: 'petrol',
  // white text on the light scheme's, dark text on the dark scheme's
  primaryShade: { light: 7, dark: 4 },
  autoContrast: true,
  black: gray[9],
  fontFamily: font,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: font,
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.75rem', lineHeight: '1.25' },
      h2: { fontSize: '1.25rem', lineHeight: '1.35' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.4' },
    },
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
  },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.55', xl: '1.5' },
  // 8 px steps, with 12 between the tight and the loose
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  components: {
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    Alert: { defaultProps: { variant: 'light' } },
    Anchor: { defaultProps: { underline: 'hover' } },
  },
});
