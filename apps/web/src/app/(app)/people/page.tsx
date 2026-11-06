import Link from "next/link";
import { api, type Department, type JobRole, type Me, type Member, type PendingInvite } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Avatar, Badge, Card, Empty, Field, LinkButton, PageHeader, RowAction, Select, Split, TableCard } from "@/components/ui";
import { createDepartment, deleteDepartment, importPeople, inviteMember, revokeInvite } from "../../actions";
import { getI18n } from "@/lib/i18n/server";
import type { Key } from "@/lib/i18n";

export const metadata = { title: "People · Seamless Source HR" };

export default async function People() {
  const { t, tn } = await getI18n();
  const me = await api<Me>("/me");
  const can = (p: string) => me.permissions.includes(p);
  const [members, departments, roles, invites] = await Promise.all([
    api<Member[]>("/members"), api<Department[]>("/departments"), api<JobRole[]>("/roles"),
    can("member.invite") ? api<PendingInvite[]>("/invites") : Promise.resolve([] as PendingInvite[]),
  ]);
  const dept = new Map(departments.map((d) => [d.id, d.name]));
  const role = new Map(roles.map((r) => [r.id, r.name]));

  return (
    <>
      <PageHeader title={t("people.title")} sub={t("people.summary", { people: tn("people.person", members.length), depts: tn("people.dept", departments.length) })}>
        <LinkButton href="/people/chart" variant="ghost">{t("nav.orgChart")}</LinkButton>
      </PageHeader>
      <Split>
        <TableCard>
          <thead>
            <tr><th>{t("people.name")}</th><th>{t("people.department")}</th><th>{t("people.jobRole")}</th><th>{t("people.status")}</th></tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const name = `${m.firstName} ${m.lastName}`;
              return (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={name} member={m} />
                      <div className="min-w-0">
                        <Link className="link" href={`/people/${m.id}`}>{name}</Link>
                        <div className="truncate text-xs text-muted">{m.workEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td>{(m.departmentId && dept.get(m.departmentId)) || "—"}</td>
                  <td>{m.isOwner ? t("people.owner") : ((m.jobRoleId && role.get(m.jobRoleId)) || "—")}</td>
                  <td><Badge tone={m.status === "ACTIVE" ? "good" : "warn"}>{t(`people.state.${m.status}` as Key)}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>

        <div className="space-y-6">
          {can("member.invite") && (
            <Card title={t("people.invite")} sub={t("people.inviteSub")}>
              <ActionForm action={inviteMember} submit={t("people.sendInvite")} block>
                <Field label={t("people.email")} name="email" type="email" required />
                <Select label={t("people.department")} name="departmentId" defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
                <Select label={t("people.jobRole")} name="jobRoleId" defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </ActionForm>
              {invites.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("people.pending")}</p>
                  <ul className="space-y-2">
                    {invites.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{i.email}</span>
                        <RowAction action={revokeInvite} id={i.id} label={t("people.revoke")} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {can("member.invite") && (
            <Card title={t("people.import")} sub={t("people.importSub")}>
              <ActionForm action={importPeople} submit={t("people.importBtn")} block>
                <input type="file" name="file" accept=".csv,text/csv" required aria-label="CSV file" className="input py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" />
                <p className="text-xs text-muted">{t("people.importHelp")}</p>
              </ActionForm>
            </Card>
          )}

          <Card title={t("people.departments")}>
            {departments.length === 0 ? <Empty>{t("people.noDepts")}</Empty> : (
              <ul className="rows mb-4 -mx-1">
                {departments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-1 py-2 text-sm">
                    <span className={d.parentId ? "pl-4 text-muted" : "font-medium"}>{d.parentId ? "↳ " : ""}{d.name}</span>
                    {can("department.manage") && <RowAction action={deleteDepartment} id={d.id} label={t("people.delete")} variant="danger" />}
                  </li>
                ))}
              </ul>
            )}
            {can("department.manage") && (
              <ActionForm action={createDepartment} submit={t("people.addDept")} block>
                <Field label={t("people.name")} name="name" required />
                <Select label={t("people.parent")} name="parentId" defaultValue="">
                  <option value="">{t("people.topLevel")}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </ActionForm>
            )}
          </Card>
        </div>
      </Split>
    </>
  );
}
