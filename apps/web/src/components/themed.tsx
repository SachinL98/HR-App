import type { ReactNode } from "react";
import { DEFAULT_THEME, themeStyle, type OrgTheme } from "@/lib/theme";

/** Wraps UI in the company's admin-set colours, radius and light/dark mode. */
export function Themed({ theme = DEFAULT_THEME, children, className }: { theme?: OrgTheme; children: ReactNode; className?: string }) {
  return (
    <div data-mode={theme.themeMode} style={themeStyle(theme)} className={className ?? "min-h-screen bg-bg text-ink"}>
      {children}
    </div>
  );
}
