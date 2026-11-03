import Link from "next/link";
import { api, type Member, type PayGroup, type SalaryRow } from "@/lib/api";
import { money } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { Card, Field, PageHeader, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { saveSalary } from "../../../actions";

export const metadata = { title: "Salaries · HR App" };

export default async function Salaries() {
  const me = await requireAny("payroll.view", "payroll.manage");
  const manage = me.permissions.includes("payroll.manage");
  const [rows, groups, members] = await Promise.all([api<SalaryRow[]>("/payroll/salaries"), api<PayGroup[]>("/pay-groups"), api<Member[]>("/members")]);
  return (
    <>
      <PageHeader title="Salaries" sub="Stored encrypted. Only people with payroll access see them.">
        <Link href="/payroll" className="text-sm text-primary underline">← Payroll</Link>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Person</th><th className="p-3 font-medium">Pay group</th><th className="p-3 text-right font-medium">Basic / month</th><th className="p-3 font-medium">Tax code</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td className="p-4 text-muted" colSpan={4}>No salaries set yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.memberId} className="border-t border-line">
                  <td className="p-3 font-medium">{r.member.firstName} {r.member.lastName}</td>
                  <td className="p-3">{r.payGroup.name}</td>
                  <td className="p-3 text-right">{money(r.basic, r.payGroup.currency)}</td>
                  <td className="p-3 text-muted">{r.taxProfile?.taxCode ?? "default"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {manage && (
          <Card>
            <h2 className="mb-3 font-semibold">Set or change a salary</h2>
            {groups.length === 0 ? <p className="text-sm text-muted">Create a pay group on the Payroll page first.</p> : (
              <ActionForm action={saveSalary} submit="Save salary">
                <Select label="Person" name="memberId" required>{members.filter((m) => m.status === "ACTIVE").map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
                <Select label="Pay group" name="payGroupId" required>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.currency})</option>)}</Select>
                <Field label="Basic pay per month" name="basic" type="number" step="0.01" min={0} required />
                <Field label="Travel allowance (not taxed)" name="travel" type="number" step="0.01" min={0} />
                <Field label="Other allowance (taxed)" name="allowance" type="number" step="0.01" min={0} />
                <Field label="Effective from" name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                <Field label="UK tax code (optional)" name="taxCode" placeholder="1257L" />
                <Select label="UK National Insurance" name="niCategory" defaultValue=""><option value="">Standard (A)</option><option value="C">Over state pension age (C)</option><option value="X">None</option></Select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pensionOptOut" /> Opted out of workplace pension (UK)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noRelief" /> Personal relief claimed elsewhere (Sri Lanka)</label>
              </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
