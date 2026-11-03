export interface OrgTheme {
  themePrimary: string;
  themeAccent: string;
  themeMode: "light" | "dark" | "system";
  themeRadius: "sm" | "md" | "lg";
}

export const DEFAULT_THEME: OrgTheme = {
  themePrimary: "#3B3FD8",
  themeAccent: "#14B8A6",
  themeMode: "system",
  themeRadius: "md",
};

const RADIUS = { sm: "6px", md: "10px", lg: "16px" } as const;

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour that stays readable on top of the admin's chosen colour. */
export function readableOn(hex: string) {
  return contrast(hex, "#ffffff") >= contrast(hex, "#111827") ? "#ffffff" : "#111827";
}

export function themeStyle(t: OrgTheme): Record<string, string> {
  return {
    "--primary": t.themePrimary,
    "--primary-fg": readableOn(t.themePrimary),
    "--accent": t.themeAccent,
    "--accent-fg": readableOn(t.themeAccent),
    "--ui-radius": RADIUS[t.themeRadius] ?? RADIUS.md,
  };
}
