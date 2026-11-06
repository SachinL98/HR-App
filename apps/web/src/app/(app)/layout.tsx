import type { ReactNode } from "react";
import Link from "next/link";
import { api, type AccountOverview, type Me, type NotificationList, type Org } from "@/lib/api";
import { Themed } from "@/components/themed";
import { AppShell, type NavGroup } from "@/components/app-shell";
import { UserMenu } from "@/components/user-menu";
import { cookies } from "next/headers";
import { LogoMark } from "@/components/logo";
import { PlanBanner } from "@/components/plan-banner";
import { logout } from "../actions";
import { getI18n } from "@/lib/i18n/server";

// Everything under (app) is per-user and needs the session, so it renders on request.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [me, org, inbox, notes, acct] = await Promise.all([api<Me>("/me"), api<Org>("/org"), api<unknown[]>("/requests/inbox"), api<NotificationList>("/notifications?unread=1"), api<AccountOverview>("/account")]);
  const can = (p: string) => me.permissions.includes(p);
  const { t } = await getI18n();

  const groups: NavGroup[] = [
    { items: [{ href: "/dashboard", label: t("nav.home"), icon: "home" }] },
    {
      title: t("nav.timeOff"),
      items: [
        { href: "/calendar", label: t("nav.calendar"), icon: "calendar" },
        { href: "/leave", label: t("nav.leave"), icon: "leave" },
        { href: "/approvals", label: t("nav.approvals"), icon: "check", badge: inbox.length },
      ],
    },
    {
      title: t("nav.company"),
      items: [
        { href: "/notices", label: t("nav.notices"), icon: "megaphone" },
        { href: "/people", label: t("nav.people"), icon: "users" },
        { href: "/people/chart", label: t("nav.orgChart"), icon: "chart" },
        { href: "/documents", label: t("nav.documents"), icon: "file" },
      ],
    },
    {
      title: t("nav.pay"),
      items: [
        { href: "/payslips", label: t("nav.payslips"), icon: "wallet" },
        ...(can("payroll.view") || can("payroll.manage") ? [{ href: "/payroll", label: t("nav.payroll"), icon: "payroll" as const }] : []),
      ],
    },
  ];

  const admin: NavGroup["items"] = [];
  if (can("document.issue") || can("document.template.manage") || can("document.request.approve")) admin.push({ href: "/documents/manage", label: t("nav.manageDocuments"), icon: "folder" });
  if (can("leave.approve")) admin.push({ href: "/settings/approvals", label: t("nav.approvalSteps"), icon: "check" });
  if (can("quota.manage") || can("holiday.manage")) admin.push({ href: "/settings/leave", label: t("nav.leavePolicy"), icon: "sliders" });
  if (can("role.manage")) admin.push({ href: "/settings/roles", label: t("nav.roles"), icon: "shield" });
  if (can("checklist.manage")) admin.push({ href: "/settings/checklists", label: t("nav.checklists"), icon: "list" });
  if (can("billing.manage") || me.isOwner) admin.push({ href: "/settings/billing", label: t("nav.billing"), icon: "wallet" });
  if (can("audit.view")) admin.push({ href: "/settings/audit", label: t("nav.activity"), icon: "list" });
  if (can("branding.manage")) admin.push({ href: "/settings/appearance", label: t("nav.appearance"), icon: "palette" });
  if (admin.length) groups.push({ title: t("nav.admin"), items: admin });

  const fullName = `${me.firstName} ${me.lastName}`;
  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      <LogoMark size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{org.displayName}</p>
        <p className="truncate text-xs text-muted">Seamless Source HR</p>
      </div>
    </div>
  );
  const jar = await cookies();
  const pref = jar.get("hr_mode")?.value;
  const mode = (pref === "light" || pref === "dark" || pref === "system" ? pref : org.themeMode) as "light" | "dark" | "system";
  const userMenu = (
    <UserMenu name={fullName} role={me.isOwner ? "Owner" : (me.jobRole?.name ?? "Member")} mode={mode} dashboard={!!process.env.DASHBOARD_URL} signOut={logout} />
  );
  const action = (
    <Link href="/leave" className="hidden h-10 items-center rounded-ui bg-primary px-4 text-sm font-medium text-primary-fg shadow-sm hover:opacity-90 md:inline-flex">
      + {t("leave.newRequest")}
    </Link>
  );

  return (
    <Themed theme={{ ...org, themeMode: mode }}>
      <AppShell groups={groups} brand={brand} userMenu={userMenu} action={action} unread={notes.unreadCount}>
        {(me.isOwner || can("billing.manage")) && org.plan && <PlanBanner plan={org.plan} trialDaysLeft={org.trialDaysLeft} t={t} />}
        {acct.mailEnabled && !acct.emailVerified && (
          <p role="status" className="mb-6 rounded-ui border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Please confirm your email address. We sent a link to {acct.email}.
          </p>
        )}
        {(can("payroll.manage") || can("permission.grant") || me.isOwner) && !acct.mfaEnabled && (
          <p role="status" className="mb-6 rounded-ui border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
            Your account can see or change sensitive data. <Link className="link" href="/account">Turn on two-factor sign-in</Link> to protect it.
          </p>
        )}
        {children}
      </AppShell>
    </Themed>
  );
}
