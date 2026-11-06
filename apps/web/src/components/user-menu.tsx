"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { setMode } from "@/app/actions";
import { Avatar } from "./ui";
import { useI18n } from "./i18n";

type Mode = "light" | "system" | "dark";
const MODES: { id: Mode; key: "menu.light" | "menu.system" | "menu.dark"; d: string }[] = [
  { id: "light", key: "menu.light", d: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" },
  { id: "system", key: "menu.system", d: "M3 5h18v11H3zM8 21h8M12 16v5" },
  { id: "dark", key: "menu.dark", d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" },
];
const ico = (d: string) => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d={d} /></svg>
);

/** Avatar button in the top bar: the person, theme, a switch to the Developer Dashboard, account and sign out. */
export function UserMenu({ name, role, mode, dashboard, signOut }: { name: string; role: string; mode: Mode; dashboard: boolean; signOut: () => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Mode>(mode);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  const choose = (m: Mode) => { setCurrent(m); start(() => setMode(m)); };
  const item = "flex w-full items-center gap-2.5 rounded-ui px-3 py-2 text-sm hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("menu.open")} className="flex rounded-full p-0.5 hover:bg-surface-2">
        <Avatar name={name} size={36} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={name} size={40} />
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="truncate text-xs text-muted">{role}</p></div>
          </div>
          <div className="border-t border-line px-3 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("menu.theme")}</p>
            <div role="radiogroup" aria-label={t("menu.theme")} className="grid grid-cols-3 gap-1 rounded-ui border border-line bg-surface-2 p-1">
              {MODES.map((m) => (
                <button key={m.id} role="radio" aria-checked={current === m.id} onClick={() => choose(m.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-[calc(var(--ui-radius)-2px)] px-2 py-1.5 text-xs font-medium ${current === m.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}>
                  {ico(m.d)}{t(m.key)}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-1">
            {/* A plain link on purpose: this route mints a one-minute sign-in token, which a prefetch must not trigger. */}
            {dashboard && <a href="/api/go/dashboard" role="menuitem" className={item}>{ico("M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4")}{t("menu.switchDashboard")}</a>}
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className={item}>{ico("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z")}{t("nav.account")}</Link>
            <form action={signOut}><button role="menuitem" className={item}>{ico("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9")}{t("common.signOut")}</button></form>
          </div>
        </div>
      )}
    </div>
  );
}
