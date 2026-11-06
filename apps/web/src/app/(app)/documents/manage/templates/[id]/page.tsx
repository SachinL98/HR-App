import { notFound } from "next/navigation";
import { api, type DocTemplate } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, Textarea } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { updateTemplate } from "../../../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Edit template · Seamless Source HR" };

export default async function EditTemplate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t: tr } = await getI18n();
  await requireAny("document.template.manage");
  const [templates, fields] = await Promise.all([api<DocTemplate[]>("/document-templates"), api<{ name: string; label: string }[]>("/document-fields")]);
  const t = templates.find((x) => x.id === id);
  if (!t) notFound();
  return (
    <>
      <PageHeader title={t.name} sub={tr("md.edit.sub", { v: t.version })} back={{ href: "/documents/manage", label: tr("md.title") }} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={tr("md.edit.text")}>
          <ActionForm action={updateTemplate} submit={tr("profile.saveChanges")}>
            <input type="hidden" name="id" value={t.id} />
            <Field label={tr("md.edit.name")} name="name" required maxLength={80} defaultValue={t.name} />
            <Textarea label={tr("md.edit.body")} name="body" rows={22} required defaultValue={t.html ?? ""} className="font-mono text-xs" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requestable" defaultChecked={t.requestable} /> {tr("md.form.employeesRequest")}</label>
          </ActionForm>
        </Card>
        <Card title={tr("md.edit.fields")} sub={tr("md.edit.fieldsSub")}>
          <ul className="space-y-1.5 text-sm">
            {fields.map((f) => <li key={f.name} className="flex flex-wrap items-center justify-between gap-2"><code className="text-xs">{`{{${f.name}}}`}</code><span className="text-muted">{f.label}</span></li>)}
            <li className="flex items-center justify-between gap-2"><code className="text-xs">{"{{stamp}}"}</code><Badge>{tr("md.stamp")}</Badge></li>
            <li className="flex items-center justify-between gap-2"><code className="text-xs">{"{{signature.name}}"}</code><Badge>{tr("md.edit.aSignature")}</Badge></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
