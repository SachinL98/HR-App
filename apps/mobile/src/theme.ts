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
  dark: boolean;
  primary: string; primaryFg: string; accent: string; accentFg: string;
  bg: string; surface: string; surface2: string; line: string; ink: string; muted: string; radius: number;
  good: string; goodBg: string; warn: string; warnBg: string; bad: string; badBg: string; info: string; infoBg: string;
}

export function resolveColors(t: OrgTheme, deviceScheme: 'light' | 'dark' | null | undefined): Colors {
  const dark = t.themeMode === 'dark' || (t.themeMode === 'system' && deviceScheme === 'dark');
  const radius = { sm: 6, md: 10, lg: 16 }[t.themeRadius] ?? 10;
  return {
    dark,
    primary: t.themePrimary, primaryFg: readableOn(t.themePrimary),
    accent: t.themeAccent, accentFg: readableOn(t.themeAccent),
    bg: dark ? '#0b0e14' : '#f4f5f8', surface: dark ? '#141822' : '#ffffff', surface2: dark ? '#1a1f2b' : '#f8f9fb',
    line: dark ? '#262d3c' : '#e4e7ee', ink: dark ? '#eef0f6' : '#0f172a', muted: dark ? '#9aa3b6' : '#5f6b7e',
    radius,
    good: dark ? '#6ee7b7' : '#047857', goodBg: dark ? '#052e22' : '#ecfdf5',
    warn: dark ? '#fcd34d' : '#92400e', warnBg: dark ? '#2d2208' : '#fffbeb',
    bad: dark ? '#fca5a5' : '#b91c1c', badBg: dark ? '#2f0f10' : '#fef2f2',
    info: dark ? '#7dd3fc' : '#0369a1', infoBg: dark ? '#0b2433' : '#f0f9ff',
  };
}
