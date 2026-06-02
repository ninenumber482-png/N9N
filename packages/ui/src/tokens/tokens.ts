// NUMBER9 Design Tokens
export const tokens = {
  colors: {
    // Brand
    brand: {
      50: '#fff9e6',
      100: '#ffedb3',
      200: '#ffe180',
      300: '#ffd54d',
      400: '#ffc91a',
      500: '#f5b800', // Primary yellow
      600: '#c49400',
      700: '#937000',
      800: '#624c00',
      900: '#312800',
    },
    // Dark theme (matching existing app)
    surface: {
      base: '#0a0c12',
      card: '#0c0e14',
      elevated: '#0e1117',
      border: '#1f2128',
      hover: '#2a2d36',
    },
    text: {
      primary: '#ffffff',
      secondary: '#a1a1aa',
      muted: '#71717a',
      accent: '#f5b800',
    },
    // Status
    status: {
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
      pending: '#fbbf24',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },
  fontSize: {
    xs: '10px',
    sm: '12px',
    base: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '40px',
  },
  fontWeight: {
    normal: 400,
    semibold: 600,
    bold: 700,
    black: 900,
  },
} as const;

export type DesignTokens = typeof tokens;
