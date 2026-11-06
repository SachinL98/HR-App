import Link from "next/link";
import { api, type PayGroup, type PayrollRun } from "@/lib/api";
import { monthLabel } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, Select, Split, TableCard } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { createPayGroup, createRun } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Payroll · Seamless Source HR" };

const TONE = { DRAFT: "neutral", IN_REVIEW: "warn", APPROVED: "info", FINALIZED: "good" } as const;

export default async function Payroll() {
  const { t: tr, tag } = await getI18n();
  const me = await requireAny("payroll.view", "payroll.manage");
  const manage = me.permissions.includes("payroll.manage");
  const [runs, groups] = await Promise.all([api<PayrollRun[]>("/payroll/runs"), api<PayGroup[]>("/pay-groups")]);
  const month = new Date().toISOString().slice(0, 7);
  return (
    <>
      <PageHeader title={tr("pay.title")} sub={tr("pay.sub")}>
        <LinkButton href="/payroll/salaries" variant="ghost">{tr("pay.salaries")}</LinkButton>
      </PageHeader>
      <p className="mb-6 rounded-ui border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {tr("pay.disclaimer")}
      </p>
      <Split>
        <TableCard>
          <thead><tr><th>{tr("pay.run")}</th><th>{tr("pay.group")}</th><th>{tr("pay.payslips")}</th><th>{tr("pay.status")}</th></tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={4}><Empty>{tr("pay.noRuns")}</Empty></td></tr>}
            {runs.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/payroll/runs/${r.id}`} className="link">{monthLabel(r.periodStart, tag)}</Link></td>
                <td>{r.payGroup.name}</td>
                <td className="text-muted">{r._count.payslips}</td>
                <td><Badge tone={TONE[r.status]}>{tr(`pay.state.${r.status}`)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        {manage && (
          <div className="space-y-6">
            <Card title={tr("pay.start")} sub={tr("pay.startSub")}>
              {groups.length === 0 ? <p className="text-sm text-muted">{tr("pay.createGroupFirst")}</p> : (
                <ActionForm action={createRun} submit={tr("pay.calculate")} block>
                  <Select label={tr("pay.group")} name="payGroupId" required>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
                  <Field label={tr("pay.monthLabel")} name="month" type="month" defaultValue={month} required />
                </ActionForm>
              )}
            </Card>
            <Card title={tr("pay.newGroup")}>
              {groups.length > 0 && (
                <ul className="rows mb-4 text-sm">
                  {groups.map((g) => <li key={g.id} className="py-2 text-muted"><span className="font-medium text-ink">{g.name}</span> · {g.currency} · day {g.payDay}{g.taxRegime ? ` · ${g.taxRegime.toUpperCase()} rules` : ""}</li>)}
                </ul>
              )}
              <ActionForm action={createPayGroup} submit={tr("pay.createGroup")} block>
                <Field label={tr("pay.groupName")} name="name" required maxLength={60} />
                <Field label={tr("pay.payDay")} name="payDay" type="number" min={1} max={31} defaultValue={25} required />
                <Select label={tr("pay.taxRules")} name="taxRegime" defaultValue="">
                  <option value="">{tr("common.none")}</option><option value="uk">{tr("pay.taxUK")}</option><option value="lk">{tr("pay.taxLK")}</option>
                </Select>
              </ActionForm>
            </Card>
          </div>
        )}
      </Split>
    </>
  );
}
