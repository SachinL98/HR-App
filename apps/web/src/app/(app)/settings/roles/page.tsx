import { api, type JobRole } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, PageHeader } from "@/components/ui";
import { createRole, deleteRole } from "../../../actions";
import { requireAny } from "@/lib/guard";

export const metadata = { title: "Roles · HR App" };

export default async function Roles() {
  await requireAny("role.manage");
  const [roles, catalog] = await Promise.all([
    api<JobRole[]>("/roles"), api<{ action: string; label: string }[]>("/permissions/catalog"),
  ]);
  const label = new Map(catalog.map((c) => [c.action, c.label]));
  return (
    <>
      <PageHeader title="Company roles" sub="Job titles for your company. A role can carry default admin powers." />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          {roles.length === 0 && <Card><p className="text-sm text-muted">No roles yet. Add your first one.</p></Card>}
          {roles.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{r.name}</h2>
                  {r.description && <p className="text-sm text-muted">{r.description}</p>}
                </div>
                <form action={deleteRole}><input type="hidden" name="id" value={r.id} /><Button variant="danger" type="submit" className="px-2 py-1 text-xs">Delete</Button></form>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.defaultPermissions.length === 0 ? <span className="text-xs text-muted">No admin powers</span>
                  : r.defaultPermissions.map((p) => <Badge key={p}>{label.get(p) ?? p}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">New role</h2>
          <ActionForm action={createRole} submit="Create role">
            <Field label="Name" name="name" required />
            <Field label="Description" name="description" />
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Default admin powers</legend>
              <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {catalog.map((c) => (
                  <label key={c.action} className="flex items-center gap-2"><input type="checkbox" name="perm" value={c.action} />{c.label}</label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
