import Link from "next/link";
import { api, type Department, type JobRole, type Me, type Member, type PendingInvite } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, PageHeader, Select } from "@/components/ui";
import { createDepartment, deleteDepartment, inviteMember, revokeInvite } from "../../actions";

export const metadata = { title: "People · HR App" };

export default async function People() {
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
      <PageHeader title="People" sub="Company → Department → Member" />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted">
              <tr><th className="p-3">Name</th><th className="p-3">Department</th><th className="p-3">Role</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    {can("member.manage") || can("permission.grant")
                      ? <Link className="font-medium text-primary underline" href={`/people/${m.id}`}>{m.firstName} {m.lastName}</Link>
                      : <span className="font-medium">{m.firstName} {m.lastName}</span>}
                    <div className="text-xs text-muted">{m.workEmail}</div>
                  </td>
                  <td className="p-3">{(m.departmentId && dept.get(m.departmentId)) || "—"}</td>
                  <td className="p-3">{m.isOwner ? "Owner" : ((m.jobRoleId && role.get(m.jobRoleId)) || "—")}</td>
                  <td className="p-3"><Badge tone={m.status === "ACTIVE" ? "good" : "warn"}>{m.status.toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          {can("member.invite") && (
            <Card>
              <h2 className="mb-3 font-semibold">Invite someone</h2>
              <ActionForm action={inviteMember} submit="Send invite">
                <Field label="Email" name="email" type="email" required />
                <Select label="Department" name="departmentId" defaultValue="">
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
                <Select label="Company role" name="jobRoleId" defaultValue="">
                  <option value="">None</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </ActionForm>
              {invites.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-medium uppercase text-muted">Pending</p>
                  <ul className="space-y-2">
                    {invites.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{i.email}</span>
                        <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Revoke</Button></form>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-semibold">Departments</h2>
            <ul className="mb-4 space-y-2">
              {departments.length === 0 && <li className="text-sm text-muted">No departments yet.</li>}
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.parentId ? "↳ " : ""}{d.name}</span>
                  {can("department.manage") && (
                    <form action={deleteDepartment}><input type="hidden" name="id" value={d.id} /><Button variant="danger" type="submit" className="px-2 py-1 text-xs">Delete</Button></form>
                  )}
                </li>
              ))}
            </ul>
            {can("department.manage") && (
              <ActionForm action={createDepartment} submit="Add department">
                <Field label="Name" name="name" required />
                <Select label="Parent (optional)" name="parentId" defaultValue="">
                  <option value="">Top level</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
