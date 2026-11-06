"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { searchAll, type SearchHits } from "@/app/actions";
import { Icon, type IconName, type NavGroup } from "./app-shell";
import { useI18n } from "./i18n";

interface Row { id: string; group: string; label: string; detail?: string; href: string; icon?: IconName; newTab?: boolean }


/**
 * Ctrl or Cmd + K (or the Search button) opens one box that jumps to any page and, as you type,
 * finds people, notices and documents. Arrow keys move, Enter opens, Escape closes.
 */
export function CommandBar({ groups, open, onClose }: { groups: NavGroup[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const actions = useMemo<Row[]>(() => [
    { id: "a-leave", group: t("search.actions"), label: t("search.actionLeave"), href: "/leave", icon: "leave" },
    { id: "a-ooo", group: t("search.actions"), label: t("search.actionOoo"), href: "/calendar", icon: "calendar" },
    { id: "a-account", group: t("search.actions"), label: t("search.actionAccount"), href: "/account", icon: "shield" },
    { id: "a-notes", group: t("search.actions"), label: t("search.actionNotes"), href: "/notifications", icon: "bell" },
  ], [t]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHits | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const pages = useMemo<Row[]>(
    () => groups.flatMap((g) => g.items).map((i) => ({ id: `p-${i.href}`, group: t("search.goTo"), label: i.label, href: i.href, icon: i.icon })),
    [groups, t],
  );

  // Search the server a moment after typing stops.
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    let stale = false;
    const t = setTimeout(() => { void searchAll(q).then((r) => { if (!stale) setHits(r); }); }, 180);
    return () => { stale = true; clearTimeout(t); };
  }, [q, open]);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (r: Row) => !term || r.label.toLowerCase().includes(term);
    const found: Row[] = term.length >= 2 && hits ? [
      ...hits.people.map((p) => ({ id: `u-${p.id}`, group: t("search.people"), label: p.name, detail: p.detail, href: `/people/${p.id}`, icon: "users" as IconName })),
      ...hits.notices.map((n) => ({ id: `n-${n.id}`, group: t("search.notices"), label: n.title, href: "/notices", icon: "megaphone" as IconName })),
      ...hits.documents.map((d) => ({ id: `d-${d.id}`, group: t("search.documents"), label: d.name, detail: d.detail, href: `/documents/${d.id}/pdf`, icon: "file" as IconName, newTab: true })),
    ] : [];
    return [...pages.filter(match), ...actions.filter(match), ...found].slice(0, 30);
  }, [q, pages, hits, actions, t]);

  const close = useCallback(() => { setQ(""); setHits(null); setActive(0); onClose(); }, [onClose]);
  const go = useCallback((r: Row) => {
    close();
    if (r.newTab) window.open(r.href, "_blank", "noopener");
    else router.push(r.href);
  }, [close, router]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  const clamp = Math.min(active, Math.max(rows.length - 1, 0));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((clamp + 1) % Math.max(rows.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((clamp - 1 + rows.length) % Math.max(rows.length, 1)); }
    else if (e.key === "Enter" && rows[clamp]) { e.preventDefault(); go(rows[clamp]); }
    else if (e.key === "Tab") e.preventDefault(); // focus stays in the box
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKey}>
      <button aria-label={t("common.close")} tabIndex={-1} className="absolute inset-0 bg-black/50" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label={t("search.label")} className="relative w-full max-w-xl overflow-hidden rounded-ui border border-line bg-surface shadow-[var(--shadow-pop)]">
        <input
          ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
          role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={rows[clamp] ? `${listId}-${rows[clamp].id}` : undefined}
          placeholder={t("search.placeholder")} aria-label={t("search.label")}
          className="w-full border-0 border-b border-line bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-muted"
        />
        <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{q.trim().length < 2 ? t("search.keepTyping") : t("search.nothing")}</li>}
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={r.id} role="presentation">
                {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{header}</p>}
                <div
                  id={`${listId}-${r.id}`} role="option" aria-selected={i === clamp}
                  onMouseMove={() => setActive(i)} onClick={() => go(r)}
                  className={`flex cursor-pointer items-center gap-3 rounded-ui px-3 py-2 text-sm ${i === clamp ? "bg-primary text-primary-fg" : ""}`}
                >
                  {r.icon && <Icon name={r.icon} className="h-4 w-4 shrink-0 opacity-80" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                  {r.detail && <span className={`truncate text-xs ${i === clamp ? "opacity-80" : "text-muted"}`}>{r.detail}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted"><span>{t("search.help")}</span></p>
      </div>
    </div>
  );
}
