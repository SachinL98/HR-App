import Link from "next/link";
import { api, type Department, type JobRole, type Member } from "@/lib/api";
import { Avatar, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Org chart · Seamless Source HR" };

interface Node { m: Member; kids: Node[] }

/** Builds the reporting tree. Anyone whose manager is missing, inactive, or part of a loop becomes a top-level person. */
function tree(members: Member[]) {
  const active = members.filter((m) => m.status === "ACTIVE");
  const byId = new Map(active.map((m) => [m.id, m]));
  const loops = (m: Member) => {
    const seen = new Set([m.id]);
    for (let cur = byId.get(m.managerId ?? ""); cur; cur = byId.get(cur.managerId ?? "")) {
      if (seen.has(cur.id)) return true;
      seen.add(cur.id);
    }
    return false;
  };
  const kids = new Map<string, Member[]>();
  const roots: Member[] = [];
  for (const m of active) {
    if (m.managerId && byId.has(m.managerId) && !loops(m)) kids.set(m.managerId, [...(kids.get(m.managerId) ?? []), m]);
    else roots.push(m);
  }
  const build = (m: Member): Node => ({ m, kids: (kids.get(m.id) ?? []).sort((a, b) => a.firstName.localeCompare(b.firstName)).map(build) });
  return roots.sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.firstName.localeCompare(b.firstName)).map(build);
}

function Person({ m, role, dept, owner }: { m: Member; role?: string; dept?: string; owner: string }) {
  const name = `${m.firstName} ${m.lastName}`;
  return (
    <Link href={`/people/${m.id}`} className="inline-flex min-w-56 items-center gap-3 rounded-ui border border-line bg-surface px-3 py-2 shadow-[var(--shadow)] transition hover:border-primary">
      <Avatar name={name} size={36} />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted">{[m.isOwner ? owner : role, dept].filter(Boolean).join(" · ") || m.workEmail}</span>
      </span>
    </Link>
  );
}

export default async function Chart({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { t, tn } = await getI18n();
  const sp = await searchParams;
  const byDept = sp.view === "department";
  const [members, departments, roles] = await Promise.all([api<Member[]>("/members"), api<Department[]>("/departments"), api<JobRole[]>("/roles")]);
  const dept = new Map(departments.map((d) => [d.id, d.name]));
  const role = new Map(roles.map((r) => [r.id, r.name]));
  const info = (m: Member) => ({ role: (m.jobRoleId && role.get(m.jobRoleId)) || undefined, dept: (m.departmentId && dept.get(m.departmentId)) || undefined });

  const render = (n: Node) => (
    <li key={n.m.id} className="relative pl-6 before:absolute before:left-0 before:top-0 before:h-full before:border-l before:border-line last:before:h-6 after:absolute after:left-0 after:top-6 after:w-5 after:border-t after:border-line">
      <div className="py-1.5"><Person m={n.m} {...info(n.m)} owner={t("people.owner")} /></div>
      {n.kids.length > 0 && <ul className="ml-5">{n.kids.map(render)}</ul>}
    </li>
  );
  const active = members.filter((m) => m.status === "ACTIVE");
  const groups = [...departments.map((d) => ({ id: d.id, name: d.name })), { id: "", name: t("chart.noDept") }]
    .map((g) => ({ ...g, people: active.filter((m) => (m.departmentId ?? "") === g.id) }))
    .filter((g) => g.people.length);

  return (
    <>
      <PageHeader title={t("chart.title")} sub={t("chart.sub", { people: tn("people.person", active.length) })} back={{ href: "/people", label: t("people.title") }}>
        <nav aria-label={t("chart.view")} className="flex rounded-ui border border-line bg-surface p-0.5 text-sm shadow-[var(--shadow)]">
          {([[t("chart.byManager"), "/people/chart", !byDept], [t("chart.byDept"), "/people/chart?view=department", byDept]] as const).map(([label, href, on]) => (
            <Link key={label} href={href} aria-current={on ? "page" : undefined} className={`min-h-8 rounded-[calc(var(--ui-radius)-2px)] px-3.5 py-1 font-medium leading-6 ${on ? "bg-primary text-primary-fg" : "text-muted hover:text-ink"}`}>{label}</Link>
          ))}
        </nav>
      </PageHeader>
      {active.length === 0 ? <Card><Empty>{t("chart.empty")}</Empty></Card> : byDept ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id || "none"} title={g.name} sub={tn("people.person", g.people.length)}>
              <ul className="space-y-2">{g.people.sort((a, b) => a.firstName.localeCompare(b.firstName)).map((m) => <li key={m.id}><Person m={m} role={info(m).role} owner={t("people.owner")} /></li>)}</ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto"><ul>{tree(members).map(render)}</ul></Card>
      )}
      <p className="mt-4 text-xs text-muted">{t("chart.hint")} <LinkButton href="/people" variant="subtle" size="sm">{t("chart.backToList")}</LinkButton></p>
    </>
  );
}
