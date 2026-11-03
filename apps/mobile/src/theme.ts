// Mirrors apps/web/src/lib/theme.ts. Keep the two in step (a shared package is a follow-up).
export interface OrgTheme {
  themePrimary: string;
  themeAccent: string;
  themeMode: 'light' | 'dark' | 'system';
  themeRadius: 'sm' | 'md' | 'lg';
}

export const DEFAULT_THEME: OrgTheme = {
  themePrimary: '#3B3FD8',
  themeAccent: '#14B8A6',
  themeMode: 'system',
  themeRadius: 'md',
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const readableOn = (hex: string) =>
  contrast(hex, '#ffffff') >= contrast(hex, '#111827') ? '#ffffff' : '#111827';

export interface Colors {
  primary: string; primaryFg: string; accent: string; accentFg: string;
  bg: string; surface: string; line: string; ink: string; muted: string; radius: number;
}

export function resolveColors(t: OrgTheme, deviceScheme: 'light' | 'dark' | null | undefined): Colors {
  const dark = t.themeMode === 'dark' || (t.themeMode === 'system' && deviceScheme === 'dark');
  const radius = { sm: 6, md: 10, lg: 16 }[t.themeRadius] ?? 10;
  return {
    primary: t.themePrimary, primaryFg: readableOn(t.themePrimary),
    accent: t.themeAccent, accentFg: readableOn(t.themeAccent),
    bg: dark ? '#0e1118' : '#f6f7fb', surface: dark ? '#161a24' : '#ffffff',
    line: dark ? '#262c3b' : '#e5e7ef', ink: dark ? '#eef0f6' : '#111827', muted: dark ? '#9aa2b5' : '#5b6275',
    radius,
  };
}
