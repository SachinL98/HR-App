import { api, type Holiday, type LeaveType, type Quota } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, RowAction, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { addHoliday, deleteHoliday, saveLeavePolicy, saveQuota } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Leave policy · Seamless Source HR" };

export default async function LeavePolicy() {
  const { t: tr } = await getI18n();
  const me = await requireAny("quota.manage", "holiday.manage");
  const can = (p: string) => me.permissions.includes(p);
  const year = new Date().getUTCFullYear();
  const [types, quotas, holidays] = await Promise.all([
    api<LeaveType[]>("/leave-types"), api<Quota[]>("/quotas"), api<Holiday[]>(`/holidays?year=${year}`),
  ]);
  const company = quotas.filter((q) => q.scopeType === "COMPANY");
  const name = (q: Quota) => (q.subject === "WFH" ? tr("leave.wfh") : types.find((x) => x.id === q.leaveTypeId)?.name ?? tr("leave.leaveWord"));

  return (
    <>
      <PageHeader title={tr("set.leave.title")} sub={tr("set.leave.sub")} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {can("quota.manage") && (
          <Card title={tr("set.carryTitle")} sub={tr("set.carrySub")} className="xl:col-span-2">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {types.filter((t) => t.code !== "UNPAID").map((t) => (
                <section key={t.id} className="rounded-ui border border-line bg-surface-2 p-4">
                  <h3 className="mb-3 text-sm font-semibold">{t.name}</h3>
                  <ActionForm action={saveLeavePolicy} submit={tr("common.save")} block>
                    <input type="hidden" name="id" value={t.id} />
                    <Field label={tr("set.carryMax")} name="carryOverMax" type="number" min={0} max={60} step={0.5} defaultValue={Number(t.carryOverMax ?? 0)} hint={tr("set.carryMaxHint")} />
                    <Select label={tr("set.carryLast")} name="carryOverExpiryMonths" defaultValue={t.carryOverExpiryMonths ? String(t.carryOverExpiryMonths) : ""}>
                      <option value="">{tr("set.neverExpire")}</option>
                      {[1, 2, 3, 4, 6, 9, 12].map((m) => <option key={m} value={m}>{m === 12 ? tr("set.months12") : m === 1 ? tr("set.monthIn") : tr("set.monthsIn", { n: m })}</option>)}
                    </Select>
                    <Select label={tr("set.yearlyIs")} name="accrual" defaultValue={t.accrual ?? "upfront"}>
                      <option value="upfront">{tr("set.upfront")}</option>
                      <option value="monthly">{tr("set.monthly")}</option>
                    </Select>
                  </ActionForm>
                </section>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">{tr("set.carryNote")}</p>
          </Card>
        )}
        {can("quota.manage") && (
          <Card title={tr("set.allowances")} sub={tr("set.allowancesSub")}>
            <ul className="rows mb-5 text-sm">
              {company.map((q) => <li key={q.id} className="flex justify-between py-2"><span className="font-medium">{name(q)}</span><span className="text-muted">{tr(q.period === "MONTH" ? "set.perMonth" : "set.perYear", { n: q.amountDays })}</span></li>)}
            </ul>
            <ActionForm action={saveQuota} submit={tr("set.saveAllowance")} block>
              <input type="hidden" name="scopeType" value="COMPANY" />
              <Select label={tr("set.for")} name="leaveTypeId" required>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <input type="hidden" name="subject" value="LEAVE" />
              <div className="grid grid-cols-2 gap-3">
                <Field label={tr("set.days")} name="amountDays" type="number" min={0} max={366} step={0.5} required />
                <Select label={tr("set.per")} name="period" defaultValue="YEAR"><option value="YEAR">{tr("set.year")}</option><option value="MONTH">{tr("set.month")}</option></Select>
              </div>
            </ActionForm>
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm action={saveQuota} submit={tr("set.saveWfh")} block>
                <input type="hidden" name="scopeType" value="COMPANY" /><input type="hidden" name="subject" value="WFH" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={tr("set.wfhDays")} name="amountDays" type="number" min={0} max={366} step={0.5} required />
                  <Select label={tr("set.per")} name="period" defaultValue="MONTH"><option value="MONTH">{tr("set.month")}</option><option value="YEAR">{tr("set.year")}</option></Select>
                </div>
              </ActionForm>
            </div>
          </Card>
        )}
        {can("holiday.manage") && (
          <Card title={tr("set.holidays", { year })} sub={tr("set.holidaysSub")}>
            {holidays.length === 0 ? <Empty>{tr("set.noHolidays")}</Empty> : (
              <ul className="rows mb-5 text-sm">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                    <span><span className="tabular-nums text-muted">{h.date.slice(0, 10)}</span> · <span className="font-medium">{h.name}</span></span>
                    <RowAction action={deleteHoliday} id={h.id} label={tr("set.remove")} variant="danger" />
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addHoliday} submit={tr("set.addHoliday")} block>
              <Field label={tr("set.name")} name="name" required />
              <Field label={tr("set.date")} name="date" type="date" required />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
