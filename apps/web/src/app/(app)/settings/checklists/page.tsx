import { api, type ChecklistTemplate } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, RowAction, Select, Split, Textarea } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { archiveChecklistTemplate, createChecklistTemplate } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Checklists · Seamless Source HR" };

const NEW_STARTER = `Sign your employment contract | employee | 3
Set up your laptop and accounts | hr | 1
Book a welcome chat | manager | 2
Meet your team | manager | 5
Complete your profile | employee | 7`;

export default async function Checklists() {
  const { t: tr } = await getI18n();
  const WHO = { employee: tr("set.chk.person"), manager: tr("set.chk.theirManager"), hr: tr("set.chk.hr") } as const;
  await requireAny("checklist.manage");
  const templates = await api<ChecklistTemplate[]>("/checklist-templates");
  return (
    <>
      <PageHeader title={tr("set.chk.title")} sub={tr("set.chk.sub")} />
      <Split>
        <div className="space-y-4">
          {templates.length === 0 && <Card><Empty>{tr("set.chk.none")}</Empty></Card>}
          {templates.map((t) => (
            <Card key={t.id} title={<span className="flex items-center gap-2">{t.name} <Badge tone={t.kind === "onboarding" ? "info" : "warn"}>{t.kind === "onboarding" ? tr("set.chk.joining") : tr("set.chk.leaving")}</Badge></span>} action={<RowAction action={archiveChecklistTemplate} id={t.id} label={tr("profile.remove")} />}>
              <ol className="rows text-sm">
                {t.items.map((i, n) => (
                  <li key={n} className="flex items-center justify-between gap-3 py-2">
                    <span>{i.title}</span>
                    <span className="whitespace-nowrap text-xs text-muted">{WHO[i.who]}{i.dueDays !== undefined ? ` · ${tr("set.chk.day", { n: i.dueDays })}` : ""}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
        <Card title={tr("set.chk.new")}>
          <ActionForm action={createChecklistTemplate} submit={tr("set.chk.save")} block>
            <Field label={tr("set.name")} name="name" required maxLength={80} defaultValue="New starter" />
            <Select label={tr("set.chk.for")} name="kind" defaultValue="onboarding"><option value="onboarding">{tr("set.chk.someoneJoining")}</option><option value="offboarding">{tr("set.chk.someoneLeaving")}</option></Select>
            <Textarea label={tr("set.chk.tasks")} name="items" rows={9} required defaultValue={NEW_STARTER} className="font-mono text-xs"
              hint={tr("set.chk.hint")} />
          </ActionForm>
        </Card>
      </Split>
    </>
  );
}
