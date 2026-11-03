import Link from "next/link";
import { api, type PayGroup, type PayrollRun } from "@/lib/api";
import { monthLabel } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { createPayGroup, createRun } from "../../actions";

export const metadata = { title: "Payroll · HR App" };

const TONE = { DRAFT: "neutral", IN_REVIEW: "warn", APPROVED: "warn", FINALIZED: "good" } as const;
const LABEL = { DRAFT: "Draft", IN_REVIEW: "In review", APPROVED: "Approved", FINALIZED: "Finalised" } as const;

export default async function Payroll() {
  const me = await requireAny("payroll.view", "payroll.manage");
  const manage = me.permissions.includes("payroll.manage");
  const [runs, groups] = await Promise.all([api<PayrollRun[]>("/payroll/runs"), api<PayGroup[]>("/pay-groups")]);
  const month = new Date().toISOString().slice(0, 7);
  return (
    <>
      <PageHeader title="Payroll" sub="Pay runs, pay groups and salaries.">
        <Link href="/payroll/salaries" className="text-sm text-primary underline">Salaries →</Link>
      </PageHeader>
      <p className="mb-6 rounded-ui border border-line bg-surface p-3 text-sm text-muted">
        UK and Sri Lanka tax rules are a best-effort implementation of the published monthly rules. Have an accountant check a test run before you pay anyone with it.
      </p>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="p-0">
          <h2 className="p-4 pb-2 font-semibold">Pay runs</h2>
          {runs.length === 0 && <p className="p-4 pt-0 text-sm text-muted">No runs yet. Add a pay group and salaries, then start a run.</p>}
          <ul>
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line p-4 text-sm">
                <Link href={`/payroll/runs/${r.id}`} className="font-medium hover:underline">{monthLabel(r.periodStart)} · {r.payGroup.name}</Link>
                <span className="flex items-center gap-3 text-muted">{r._count.payslips} payslips <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
        {manage && (
          <div className="space-y-6">
            <Card>
              <h2 className="mb-3 font-semibold">Start a run</h2>
              {groups.length === 0 ? <p className="text-sm text-muted">Create a pay group first.</p> : (
                <ActionForm action={createRun} submit="Calculate payslips">
                  <Select label="Pay group" name="payGroupId" required>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
                  <Field label="Month" name="month" type="month" defaultValue={month} required />
                </ActionForm>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">New pay group</h2>
              <ul className="mb-3 space-y-1 text-sm text-muted">{groups.map((g) => <li key={g.id}>{g.name} · {g.currency} · day {g.payDay}{g.taxRegime ? ` · ${g.taxRegime.toUpperCase()} rules` : ""}</li>)}</ul>
              <ActionForm action={createPayGroup} submit="Create pay group">
                <Field label="Name" name="name" required maxLength={60} />
                <Field label="Pay day of month" name="payDay" type="number" min={1} max={31} defaultValue={25} required />
                <Select label="Statutory rules" name="taxRegime" defaultValue="">
                  <option value="">None</option><option value="uk">United Kingdom (PAYE, NI, pension)</option><option value="lk">Sri Lanka (APIT, EPF, ETF)</option>
                </Select>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
