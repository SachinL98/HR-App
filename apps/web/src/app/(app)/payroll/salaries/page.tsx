import Link from "next/link";
import { api, type Member, type PayGroup, type SalaryRow } from "@/lib/api";
import { money } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, Select, Split, TableCard } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { saveBankDetails, saveSalary } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Salaries · Seamless Source HR" };

export default async function Salaries() {
  const { t: tr } = await getI18n();
  const me = await requireAny("payroll.view", "payroll.manage");
  const manage = me.permissions.includes("payroll.manage");
  const [rows, groups, members] = await Promise.all([api<SalaryRow[]>("/payroll/salaries"), api<PayGroup[]>("/pay-groups"), api<Member[]>("/members")]);
  // Whether each person has bank details on file (only the last four digits are ever shown).
  const bank = manage ? await api<Record<string, { set: boolean; last4: string | null }>>("/payroll/bank-status") : {};
  return (
    <>
      <PageHeader title={tr("sal.title")} sub={tr("sal.sub")} back={{ href: "/payroll", label: tr("sal.back") }} />
      <Split>
        <TableCard>
          <thead><tr><th>{tr("sal.person")}</th><th>{tr("sal.group")}</th><th className="text-right">{tr("sal.basic")}</th><th>{tr("sal.taxCode")}</th>{manage && <th>{tr("sal.bank")}</th>}<th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}><Empty>{tr("sal.none")}</Empty></td></tr>}
            {rows.map((r) => (
              <tr key={r.memberId}>
                <td className="font-medium">{r.member.firstName} {r.member.lastName}</td>
                <td>{r.payGroup.name}</td>
                <td className="text-right tabular-nums">{money(r.basic, r.payGroup.currency)}</td>
                <td className="text-muted">{r.taxProfile?.taxCode ?? tr("sal.default")}</td>
                {manage && <td className="text-muted">{bank[r.memberId]?.set ? `•••• ${bank[r.memberId].last4}` : tr("sal.notSet")}</td>}
                <td className="text-right"><Link href={`/payroll/salaries/${r.memberId}`} className="link text-[13px]">{tr("sal.history")}</Link></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        {manage && (
          <div className="space-y-6">
          <Card title={tr("sal.setTitle")}>
            {groups.length === 0 ? <p className="text-sm text-muted">{tr("sal.createGroupFirst")}</p> : (
              <ActionForm action={saveSalary} submit={tr("sal.save")} block>
                <Select label={tr("sal.person")} name="memberId" required>{members.filter((m) => m.status === "ACTIVE").map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
                <Select label={tr("sal.group")} name="payGroupId" required>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.currency})</option>)}</Select>
                <Field label={tr("sal.basicPay")} name="basic" type="number" step="0.01" min={0} required />
                <Field label={tr("sal.travel")} name="travel" type="number" step="0.01" min={0} />
                <Field label={tr("sal.allowance")} name="allowance" type="number" step="0.01" min={0} />
                <Field label={tr("sal.why")} name="reason" maxLength={200} placeholder={tr("sal.whyPlaceholder")} hint={tr("sal.whyHint")} />
                <Field label={tr("sal.effective")} name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                <Field label={tr("sal.ukTax")} name="taxCode" placeholder="1257L" />
                <Select label={tr("sal.ukNi")} name="niCategory" defaultValue=""><option value="">{tr("sal.niA")}</option><option value="C">{tr("sal.niC")}</option><option value="X">{tr("sal.niX")}</option></Select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pensionOptOut" /> {tr("sal.pensionOut")}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noRelief" /> {tr("sal.noRelief")}</label>
              </ActionForm>
            )}
          </Card>
          <Card title={tr("sal.bankTitle")} sub={tr("sal.bankSub")}>
            <ActionForm action={saveBankDetails} submit={tr("sal.bankSave")} block>
              <Select label={tr("sal.person")} name="memberId" required>{members.filter((m) => m.status === "ACTIVE").map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
              <Field label={tr("sal.holder")} name="holder" required maxLength={100} />
              <Field label={tr("sal.bankName")} name="bank" required maxLength={100} />
              <Field label={tr("sal.branch")} name="branch" maxLength={60} />
              <Field label={tr("sal.account")} name="account" required minLength={4} maxLength={40} autoComplete="off" hint={tr("sal.accountHint")} />
            </ActionForm>
          </Card>
          </div>
        )}
      </Split>
    </>
  );
}
