import Link from "next/link";
import { api, type Department, type Me, type Member, type Org } from "@/lib/api";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Dashboard · HR App" };

export default async function Dashboard() {
  const [me, org, members, departments] = await Promise.all([
    api<Me>("/me"), api<Org>("/org"), api<Member[]>("/members"), api<Department[]>("/departments"),
  ]);
  const sub = org.subscription;
  const trialDays = org.trialDaysLeft;
  const themed = org.themePrimary !== "#3B3FD8" || org.themeAccent !== "#14B8A6";

  const steps = [
    { done: departments.length > 0, label: "Create your departments", href: "/people", show: me.permissions.includes("department.manage") },
    { done: members.length > 1, label: "Invite your team", href: "/people", show: me.permissions.includes("member.invite") },
    { done: themed, label: "Choose your company colours", href: "/settings/appearance", show: me.permissions.includes("branding.manage") },
  ].filter((s) => s.show);

  return (
    <>
      <PageHeader title={`Welcome, ${me.firstName}`} sub={`${org.displayName} · ${org.country}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-muted">People</p><p className="mt-1 text-3xl font-semibold">{members.length}</p><p className="text-xs text-muted">of {sub?.seats} seats</p></Card>
        <Card><p className="text-sm text-muted">Departments</p><p className="mt-1 text-3xl font-semibold">{departments.length}</p></Card>
        <Card>
          <p className="text-sm text-muted">Plan</p>
          <p className="mt-1 text-3xl font-semibold capitalize">{sub?.tier.toLowerCase()}</p>
          {sub?.status === "TRIALING" && trialDays !== null && <div className="mt-1"><Badge tone="warn">{trialDays} days of trial left</Badge></div>}
        </Card>
      </div>
      {steps.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold">Get your company set up</h2>
          <ul className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${s.done ? "bg-accent text-accent-fg" : "border border-line"}`}>{s.done ? "✓" : ""}</span>
                <Link href={s.href} className={s.done ? "text-muted line-through" : "font-medium text-primary underline"}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
