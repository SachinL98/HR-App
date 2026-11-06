"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CommandBar } from "./command-bar";
import { Toaster, ToastContext } from "./toaster";
import { LanguageSwitch } from "./language-switch";
import { useI18n } from "./i18n";

export type IconName =
  | "home" | "calendar" | "leave" | "check" | "megaphone" | "users" | "file" | "wallet" | "payroll"
  | "folder" | "sliders" | "shield" | "palette" | "bell" | "list" | "chart" | "search";

export interface NavItem { href: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { title?: string; items: NavItem[] }

const ICONS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6",
  calendar: "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  leave: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2M17 3l4 4M21 3v4h-4",
  check: "M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h6",
  wallet: "M20 7H5a2 2 0 0 1 0-4h13v4ZM3 5v14a2 2 0 0 0 2 2h15V7M16 14h2",
  payroll: "M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.5 12 10.5s5 1.9 5 4-2.2 3-5 3-5-1.1-5-3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  sliders: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M18 16v4",
  shield: "M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4",
  palette: "M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A3.6 3.6 0 0 0 21 10.7C21 6.4 17 3 12 3ZM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01",
  chart: "M12 3v5M5 21v-4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M12 8H6v4M12 8h6v4M3 21h4M17 21h4M10 21h4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8ZM10.3 20a2 2 0 0 0 3.4 0",
};

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: IconName | "menu" | "close"; className?: string }) {
  const d = name === "menu" ? "M4 6h16M4 12h16M4 18h16" : name === "close" ? "M6 6l12 12M18 6 6 18" : ICONS[name];
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  const { t } = useI18n();
  // The most specific matching link wins, so "/documents" is not lit up on "/documents/manage".
  const all = groups.flatMap((g) => g.items);
  const current = all
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={t("nav.mainMenu")} className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = i.href === current;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-10 items-center gap-3 rounded-ui px-3 text-sm font-medium transition ${
                      active ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <Icon name={i.icon} />
                    <span className="flex-1 truncate">{i.label}</span>
                    {!!i.badge && (
                      <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${active ? "bg-primary-fg/20" : "bg-primary text-primary-fg"}`}>{i.badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The frame around every signed-in page: a fixed side menu on wide screens, a slide-in menu on
 * phones and tablets, and a top bar. The page itself always uses the full remaining width.
 */
export function AppShell({
  groups, brand, userMenu, action, unread, children,
}: { groups: NavGroup[]; brand: ReactNode; userMenu: ReactNode; action?: ReactNode; unread: number; children: ReactNode }) {
  const path = usePathname();
  // The menu is "open" only for the page it was opened on, so navigating closes it.
  const { t } = useI18n();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenAt(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  // Ctrl or Cmd + K opens search from anywhere.
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearching((s) => !s); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const menu = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-4">{brand}</div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2"><NavLinks groups={groups} onNavigate={() => setOpen(false)} /></div>
    </div>
  );

  return (
    <ToastContext.Provider value={true}>
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-[70] rounded-ui bg-primary px-4 py-2 text-sm font-medium text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">{t("common.skip")}</a>
      <CommandBar groups={groups} open={searching} onClose={() => setSearching(false)} />
      <Toaster />
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface lg:block">{menu}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label={t("nav.closeMenu")} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-surface shadow-[var(--shadow-pop)]">{menu}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button aria-label={t("nav.openMenu")} aria-expanded={open} onClick={() => setOpen(true)}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-ui text-muted hover:bg-surface-2 hover:text-ink lg:hidden">
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 lg:hidden">{brand}</div>
          <div className="hidden flex-1 lg:block" />
          <button onClick={() => setSearching(true)} aria-label={`${t("search.label")} (Ctrl K)`} aria-keyshortcuts="Control+K Meta+K"
            className="inline-flex h-10 items-center gap-2 rounded-ui border border-line bg-surface px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink sm:min-w-56">
            <Icon name="search" className="h-4 w-4" /><span className="hidden flex-1 text-left sm:inline">{t("search.button")}</span>
            <kbd className="hidden rounded border border-line px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <LanguageSwitch className="hidden sm:block" />
          {action}
          <Link href="/notifications" aria-label={unread ? t("topbar.unread", { n: unread }) : t("topbar.notifications")}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-ui text-muted hover:bg-surface-2 hover:text-ink">
            <Icon name="bell" className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-fg">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          {userMenu}
        </header>
        <main id="main" tabIndex={-1} className="w-full min-w-0 flex-1 outline-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
    </ToastContext.Provider>
  );
}
