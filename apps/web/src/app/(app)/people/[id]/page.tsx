import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type Department, type Grant, type JobRole, type Member } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { GrantEditor } from "@/components/grant-editor";
import { Card, PageHeader, Select } from "@/components/ui";
import { saveGrants, updateMember } from "../../../actions";
import { requireAny } from "@/lib/guard";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAny("member.manage", "permission.grant");
  const can = (p: string) => me.permissions.includes(p);
  const [members, departments, roles, catalog] = await Promise.all([
    api<Member[]>("/members"), api<Department[]>("/departments"), api<JobRole[]>("/roles"),
    api<{ action: string; label: string }[]>("/permissions/catalog"),
  ]);
  const m = members.find((x) => x.id === id);
  if (!m) notFound();
  const grants = can("permission.grant")
    ? await api<Grant[]>(`/members/${id}/permissions`).catch((e) => { if (e instanceof ApiError) return []; throw e; })
    : [];
  // You can only hand out powers you hold yourself.
  const grantable = catalog.filter((p) => me.permissions.includes(p.action));

  return (
    <>
      <PageHeader title={`${m.firstName} ${m.lastName}`} sub={m.workEmail}>
        <Link href="/people" className="text-sm text-primary underline">← Back to people</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {can("member.manage") && (
          <Card>
            <h2 className="mb-3 font-semibold">Position</h2>
            <ActionForm action={updateMember} submit="Save">
              <input type="hidden" name="id" value={m.id} />
              <Select label="Department" name="departmentId" defaultValue={m.departmentId ?? ""}>
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select label="Company role" name="jobRoleId" defaultValue={m.jobRoleId ?? ""}>
                <option value="">None</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Select label="Line manager" name="managerId" defaultValue={m.managerId ?? ""}>
                <option value="">None</option>
                {members.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}
              </Select>
              {!m.isOwner && (
                <Select label="Status" name="status" defaultValue={m.status}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="LEFT">Left the company</option>
                </Select>
              )}
            </ActionForm>
          </Card>
        )}
        {can("permission.grant") && !m.isOwner && m.id !== me.id && (
          <Card>
            <h2 className="mb-1 font-semibold">Admin powers</h2>
            <p className="mb-3 text-sm text-muted">Let this person do selected admin tasks, for the whole company or only certain departments.</p>
            <ActionForm action={saveGrants} submit="Save permissions">
              <input type="hidden" name="id" value={m.id} />
              <GrantEditor perms={grantable} departments={departments} initial={grants} />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
