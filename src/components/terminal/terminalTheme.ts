/* Cryinder terminal theme — single source of truth for the trading shell.
   80% dark surfaces / 15% blue / 5% cyan + semantic. Loss red is restrained. */

export const TERM = {
  bg: '#070B12',
  main: '#0A101A',
  panel: '#0E1622',
  elevated: '#111C29',
  card: '#162333',
  border: '#263A4F',
  borderSubtle: '#1B2A3A',
  borderActive: '#35536D',
  blue: '#18BFFF',
  blue2: '#149FE8',
  deepBlue: '#0B78C8',
  cyan: '#52D6FF',
  text: '#F2F7FA',
  text2: '#B9C7D3',
  muted: '#758696',
  disabled: '#526373',
  loss: '#E05263',
} as const;

export const TERM_FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const TERM_FONT_DISPLAY = "'Space Grotesk', 'Inter', system-ui, sans-serif";
