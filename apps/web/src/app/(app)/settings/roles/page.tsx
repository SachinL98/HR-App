import { api, type JobRole } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, RowAction, Split } from "@/components/ui";
import { createRole, deleteRole } from "../../../actions";
import { requireAny } from "@/lib/guard";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Roles · Seamless Source HR" };

export default async function Roles() {
  const { t: tr } = await getI18n();
  await requireAny("role.manage");
  const [roles, catalog] = await Promise.all([
    api<JobRole[]>("/roles"), api<{ action: string; label: string }[]>("/permissions/catalog"),
  ]);
  const label = new Map(catalog.map((c) => [c.action, c.label]));
  return (
    <>
      <PageHeader title={tr("set.roles.title")} sub={tr("set.roles.sub")} />
      <Split>
        <div className="space-y-3">
          {roles.length === 0 && <Card><Empty>{tr("set.roles.none")}</Empty></Card>}
          {roles.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{r.name}</h2>
                  {r.description && <p className="text-sm text-muted">{r.description}</p>}
                </div>
                <RowAction action={deleteRole} id={r.id} label={tr("people.delete")} variant="danger" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.defaultPermissions.length === 0 ? <span className="text-xs text-muted">{tr("set.roles.noAccess")}</span>
                  : r.defaultPermissions.map((p) => <Badge key={p}>{label.get(p) ?? p}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
        <Card title={tr("set.roles.new")}>
          <ActionForm action={createRole} submit={tr("set.roles.create")}>
            <Field label={tr("set.name")} name="name" required />
            <Field label={tr("set.roles.description")} name="description" />
            <fieldset>
              <legend className="mb-1 text-sm font-medium">{tr("set.roles.defaultAccess")}</legend>
              <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {catalog.map((c) => (
                  <label key={c.action} className="flex items-center gap-2"><input type="checkbox" name="perm" value={c.action} />{c.label}</label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </Card>
      </Split>
    </>
  );
}
