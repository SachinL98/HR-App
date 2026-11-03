import { api, type Holiday, type LeaveType, type Quota } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Button, Card, Field, PageHeader, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { addHoliday, deleteHoliday, saveQuota } from "../../../actions";

export const metadata = { title: "Leave policy · HR App" };

export default async function LeavePolicy() {
  const me = await requireAny("quota.manage", "holiday.manage");
  const can = (p: string) => me.permissions.includes(p);
  const year = new Date().getUTCFullYear();
  const [types, quotas, holidays] = await Promise.all([
    api<LeaveType[]>("/leave-types"), api<Quota[]>("/quotas"), api<Holiday[]>(`/holidays?year=${year}`),
  ]);
  const company = quotas.filter((q) => q.scopeType === "COMPANY");
  const name = (q: Quota) => (q.subject === "WFH" ? "Work from home" : types.find((t) => t.id === q.leaveTypeId)?.name ?? "Leave");

  return (
    <>
      <PageHeader title="Leave policy" sub="Allowances, and the days your company is closed." />
      <div className="grid gap-6 lg:grid-cols-2">
        {can("quota.manage") && (
          <Card>
            <h2 className="mb-1 font-semibold">Allowances</h2>
            <p className="mb-3 text-sm text-muted">Company-wide defaults. Department and person overrides use the same form through the API for now.</p>
            <ul className="mb-4 space-y-1 text-sm">
              {company.map((q) => <li key={q.id} className="flex justify-between border-b border-line py-1.5"><span>{name(q)}</span><span className="text-muted">{q.amountDays} days per {q.period === "MONTH" ? "month" : "year"}</span></li>)}
            </ul>
            <ActionForm action={saveQuota} submit="Save allowance">
              <input type="hidden" name="scopeType" value="COMPANY" />
              <Select label="For" name="leaveTypeId" required>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <input type="hidden" name="subject" value="LEAVE" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Days" name="amountDays" type="number" min={0} max={366} step={0.5} required />
                <Select label="Per" name="period" defaultValue="YEAR"><option value="YEAR">Year</option><option value="MONTH">Month</option></Select>
              </div>
            </ActionForm>
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm action={saveQuota} submit="Save work from home allowance">
                <input type="hidden" name="scopeType" value="COMPANY" /><input type="hidden" name="subject" value="WFH" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="WFH days" name="amountDays" type="number" min={0} max={366} step={0.5} required />
                  <Select label="Per" name="period" defaultValue="MONTH"><option value="MONTH">Month</option><option value="YEAR">Year</option></Select>
                </div>
              </ActionForm>
            </div>
          </Card>
        )}
        {can("holiday.manage") && (
          <Card>
            <h2 className="mb-3 font-semibold">Company holidays {year}</h2>
            <ul className="mb-4 space-y-1 text-sm">
              {holidays.length === 0 && <li className="text-muted">None added yet.</li>}
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between border-b border-line py-1.5">
                  <span>{h.date.slice(0, 10)} · {h.name}</span>
                  <form action={deleteHoliday}><input type="hidden" name="id" value={h.id} /><Button variant="danger" type="submit" className="px-2 py-1 text-xs">Remove</Button></form>
                </li>
              ))}
            </ul>
            <ActionForm action={addHoliday} submit="Add holiday">
              <Field label="Name" name="name" required />
              <Field label="Date" name="date" type="date" required />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
