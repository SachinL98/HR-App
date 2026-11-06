import Link from "next/link";
import { addDays, iso, parse, today } from "@/lib/cal";
import { api, type Balance, type CalendarData, type Department, type LeaveRequest, type Me, type Member, type MyTask, type Org } from "@/lib/api";
import { tickTask } from "../../actions";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Home · Seamless Source HR" };

export default async function Dashboard() {
  const { t, tag } = await getI18n();
  const [me, org, members, departments, balances, inbox, tasks] = await Promise.all([
    api<Me>("/me"), api<Org>("/org"), api<Member[]>("/members"), api<Department[]>("/departments"),
    api<Balance[]>("/balances/me"), api<LeaveRequest[]>("/requests/inbox"), api<MyTask[]>("/checklists/mine"),
  ]);
  // Who is away in the next seven days (leave or out of office), from the shared calendar.
  const start = today();
  const end = iso(addDays(parse(start), 6));
  const cal = await api<CalendarData>(`/calendar?from=${start}&to=${end}`);
  const away = new Map<string, { name: string; days: string[]; kind: string }>();
  for (const d of cal.days.filter((x) => x.type === "LEAVE" || x.type === "OUT_OF_OFFICE")) {
    const p = cal.members.find((m) => m.id === d.memberId);
    if (!p) continue;
    const cur = away.get(p.id) ?? { name: `${p.firstName} ${p.lastName}`, days: [], kind: d.type === "LEAVE" ? t("home.onLeave") : t("home.outOfOffice") };
    cur.days.push(d.date.slice(0, 10));
    away.set(p.id, cur);
  }
  const awayList = [...away.values()].sort((a, b) => a.days[0].localeCompare(b.days[0]));
  const sub = org.subscription;
  const trialDays = org.trialDaysLeft;
  const themed = org.themePrimary !== "#3B3FD8" || org.themeAccent !== "#14B8A6";
  const can = (p: string) => me.permissions.includes(p);

  const steps = [
    { done: departments.length > 0, label: t("home.stepDepartments"), href: "/people", show: can("department.manage") },
    { done: members.length > 1, label: t("home.stepInvite"), href: "/people", show: can("member.invite") },
    { done: themed, label: t("home.stepColours"), href: "/settings/appearance", show: can("branding.manage") },
  ].filter((s) => s.show);
  const mine = balances.filter((b) => b.entitled !== null);

  return (
    <>
      <PageHeader title={t("home.welcome", { name: me.firstName })} sub={`${org.displayName} · ${org.country}`}>
        <LinkButton href="/leave">{t("home.requestTimeOff")}</LinkButton>
        <LinkButton href="/calendar" variant="ghost">{t("home.openCalendar")}</LinkButton>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={t("home.people")} value={members.length} note={t("home.ofSeats", { n: sub?.seats ?? 0 })} />
        <Stat label={t("home.departments")} value={departments.length} />
        <Stat label={t("home.waiting")} value={inbox.length} note={inbox.length ? <Link href="/approvals" className="link">{t("home.reviewNow")}</Link> : t("home.allClear")} />
        <Stat
          label={t("home.plan")} value={<span className="capitalize">{(org.plan?.tier ?? sub?.tier ?? "").toLowerCase()}</span>}
          note={sub?.status === "TRIALING" && trialDays !== null ? t("home.trialLeft", { n: trialDays }) : undefined}
          tone="warn"
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t("home.myTimeOff")} sub={t("home.whatLeft")} action={<Link href="/leave" className="link text-sm">{t("home.seeAll")}</Link>}>
          {mine.length === 0 ? <Empty>{t("home.noAllowances")}</Empty> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {mine.map((b) => (
                <li key={b.key} className="rounded-ui border border-line bg-surface-2 p-4">
                  <p className="text-[13px] text-muted">{b.label}</p>
                  <p className="mt-0.5 text-2xl font-semibold">{b.remaining}<span className="text-sm font-normal text-muted"> {t("home.ofLeft", { n: b.entitled ?? 0 })}</span></p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${b.entitled ? Math.min(100, (Number(b.remaining) / Number(b.entitled)) * 100) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("home.awayTitle")} sub={t("home.awaySub")}>
          {awayList.length === 0 ? <Empty>{t("home.everyoneIn")}</Empty> : (
            <ul className="rows text-sm">
              {awayList.slice(0, 8).map((a) => {
                const days = [...new Set(a.days)].sort();
                const f = (d: string) => new Date(d).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" });
                return (
                  <li key={a.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-right text-xs text-muted">{a.kind} · {f(days[0])}{days.length > 1 ? ` to ${f(days[days.length - 1])}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {tasks.length > 0 && (
          <Card title={t("home.myTasks")} sub={t("home.toDo", { n: tasks.length })}>
            <ul className="rows text-sm">
              {tasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted">{task.checklist}: <Link className="link" href={`/people/${task.member.id}`}>{task.member.firstName} {task.member.lastName}</Link>{task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString(tag, { dateStyle: "medium" })}` : ""}</p>
                  </div>
                  <form action={tickTask}><input type="hidden" name="id" value={task.id} /><input type="hidden" name="done" value="1" /><button className="inline-flex min-h-8 items-center rounded-ui border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2" type="submit">{t("common.done")}</button></form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {steps.length > 0 && (
          <Card title={t("home.setup")} sub={t("home.setupDone", { done: steps.filter((s) => s.done).length, total: steps.length })}>
            <ul className="space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-accent text-accent-fg" : "border border-line"}`}>{s.done ? "✓" : ""}</span>
                  <Link href={s.href} className={s.done ? "text-muted line-through" : "link"}>{s.label}</Link>
                  {s.done && <Badge tone="good">{t("common.done")}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
