import { api, type Member, type WorkflowSteps } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { saveWorkflow } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Approval steps · Seamless Source HR" };

export default async function Approvals() {
  const { t: tr } = await getI18n();
  await requireAny("leave.approve");
  const [leave, wfh, members] = await Promise.all([api<WorkflowSteps>("/workflows/leave"), api<WorkflowSteps>("/workflows/wfh"), api<Member[]>("/members")]);
  const active = members.filter((m) => m.status === "ACTIVE");
  const value = (w: WorkflowSteps, i: number) => { const s = w.steps[i]; return !s ? "none" : s.kind === "member" ? (s.memberId ?? "none") : s.kind; };
  return (
    <>
      <PageHeader title={tr("set.appr.title")} sub={tr("set.appr.sub")} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {([["leave", tr("set.appr.leaveReq"), leave], ["wfh", tr("set.appr.wfhReq"), wfh]] as const).map(([type, title, w]) => (
          <Card key={type} title={title} sub={w.custom ? tr("set.appr.custom") : tr("set.appr.default")}>
            <ActionForm action={saveWorkflow} submit={tr("set.appr.save")} block>
              <input type="hidden" name="type" value={type} />
              {[0, 1, 2].map((i) => (
                <Select key={i} label={i === 0 ? tr("set.appr.first") : i === 1 ? tr("set.appr.then") : tr("set.appr.finally")} name={`step${i + 1}`} defaultValue={value(w, i)}>
                  {i > 0 && <option value="none">{tr("set.appr.noMore")}</option>}
                  <option value="manager">{tr("set.appr.manager")}</option>
                  <option value="dept_head">{tr("set.appr.deptHead")}</option>
                  {active.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                </Select>
              ))}
              <p className="text-xs text-muted">{tr("set.appr.ownerNote")}</p>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
