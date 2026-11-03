import type { ReactNode } from "react";
import { api, type Me, type NotificationList, type Org } from "@/lib/api";
import { Themed } from "@/components/themed";
import { Nav, type NavItem } from "@/components/nav";
import { Button } from "@/components/ui";
import { logout } from "../actions";

// Everything under (app) is per-user and needs the session, so it renders on request.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [me, org, inbox, notes] = await Promise.all([api<Me>("/me"), api<Org>("/org"), api<unknown[]>("/requests/inbox"), api<NotificationList>("/notifications?unread=1")]);
  const can = (p: string) => me.permissions.includes(p);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/calendar", label: "Calendar" },
    { href: "/leave", label: "Leave & WFH" },
    { href: "/approvals", label: inbox.length ? `Approvals (${inbox.length})` : "Approvals" },
    { href: "/notices", label: "Notices" },
    { href: "/notifications", label: notes.unreadCount ? `Notifications (${notes.unreadCount})` : "Notifications" },
    { href: "/people", label: "People" },
  ];
  if (can("quota.manage") || can("holiday.manage")) items.push({ href: "/settings/leave", label: "Leave policy" });
  if (can("role.manage")) items.push({ href: "/settings/roles", label: "Roles" });
  if (can("branding.manage")) items.push({ href: "/settings/appearance", label: "Appearance" });

  return (
    <Themed theme={org}>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <aside className="shrink-0 border-b border-line bg-surface p-4 md:w-60 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-ui bg-primary text-sm font-bold text-primary-fg">
              {org.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{org.displayName}</p>
              <p className="text-xs text-muted">{org.subscription?.tier.toLowerCase()} plan</p>
            </div>
          </div>
          <Nav items={items} />
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-end gap-3 border-b border-line bg-surface px-6 py-3">
            <div className="text-right text-sm">
              <p className="font-medium">{me.firstName} {me.lastName}</p>
              <p className="text-xs text-muted">{me.isOwner ? "Owner" : (me.jobRole?.name ?? "Member")}</p>
            </div>
            <form action={logout}><Button variant="ghost" type="submit">Sign out</Button></form>
          </header>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </Themed>
  );
}
