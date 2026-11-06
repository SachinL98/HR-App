import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type PayrollRunDetail } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, LinkButton, PageHeader, Stat, TableCard } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { moveRunStep } from "../../../../actions";
import { getI18n } from "@/lib/i18n/server";

const NEXT = {
  DRAFT: [{ step: "submit" }],
  IN_REVIEW: [{ step: "approve" }, { step: "reopen", ghost: true }],
  APPROVED: [{ step: "finalize" }, { step: "reopen", ghost: true }],
  FINALIZED: [],
} as const;

export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t: tr, tag } = await getI18n();
  const me = await requireAny("payroll.view", "payroll.manage");
  const run = await api<PayrollRunDetail>(`/payroll/runs/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  const cur = run.payGroup.currency;
  const manage = me.permissions.includes("payroll.manage");
  return (
    <>
      <PageHeader title={`${monthLabel(run.periodStart, tag)} · ${run.payGroup.name}`} sub={run.ruleVersion ? tr("run.rules", { v: run.ruleVersion }) : tr("run.noRules")} back={{ href: "/payroll", label: tr("run.back") }} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[[tr("run.gross"), run.totals.gross], [tr("run.net"), run.totals.net], [tr("run.cost"), run.totals.employerCost]].map(([l, v]) => (
          <Stat key={l as string} label={l as string} value={money(v as number, cur)} />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Badge tone={run.status === "FINALIZED" ? "good" : "warn"}>{tr(`pay.state.${run.status}`)}</Badge>
        {manage && !run.youMustWait && NEXT[run.status].map((n) => (
          <ActionForm key={n.step} action={moveRunStep} submit={tr(`run.step.${n.step}`)} variant={"ghost" in n ? "ghost" : undefined} className="space-y-2">
            <input type="hidden" name="id" value={run.id} /><input type="hidden" name="step" value={n.step} />
          </ActionForm>
        ))}
        {manage && run.status === "DRAFT" && (
          <ActionForm action={moveRunStep} submit={tr("run.recalc")} variant="ghost" className="space-y-2">
            <input type="hidden" name="id" value={run.id} /><input type="hidden" name="step" value="recompute" />
          </ActionForm>
        )}
      </div>
      {run.youMustWait && (
        <p role="status" className="mb-4 rounded-ui border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          {tr("run.mustWait")}
        </p>
      )}
      {manage && !run.dualControl && run.status !== "FINALIZED" && (
        <p className="mb-4 rounded-ui border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          {tr("run.solo")}
        </p>
      )}
      <Card title={tr("run.whoDidWhat")} className="mb-6">
        <ol className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {([
            [tr("run.prepared"), run.people.preparedBy, run.createdAt],
            [tr("run.sent"), run.people.submittedBy, run.submittedAt],
            [tr("run.approved"), run.people.approvedBy, run.approvedAt],
            [tr("run.released"), run.people.finalizedBy, run.finalizedAt],
          ] as const).map(([label, who, at]) => (
            <li key={label} className="rounded-ui border border-line bg-surface-2 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
              <p className="mt-1 font-medium">{who ?? tr("run.notYet")}</p>
              {who && at && <p className="text-xs text-muted">{new Date(at).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" })}</p>}
            </li>
          ))}
        </ol>
      </Card>
      <Card title={tr("run.download")} sub={tr("run.downloadSub")} className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={`/payroll/runs/${run.id}/export/summary`} variant="ghost" size="sm">{tr("run.dlSummary")}</LinkButton>
          <LinkButton href={`/payroll/runs/${run.id}/export/lines`} variant="ghost" size="sm">{tr("run.dlLines")}</LinkButton>
          {manage && (run.status === "APPROVED" || run.status === "FINALIZED")
            ? <LinkButton href={`/payroll/runs/${run.id}/export/bank`} variant="ghost" size="sm">{tr("run.dlBank")}</LinkButton>
            : manage && <span className="text-xs text-muted">{tr("run.bankLater")}</span>}
        </div>
      </Card>
      <TableCard>
        <thead><tr><th>{tr("run.person")}</th><th>{tr("run.unpaid")}</th><th className="text-right">{tr("run.gross")}</th><th className="text-right">{tr("run.deductions")}</th><th className="text-right">{tr("run.net")}</th></tr></thead>
        <tbody>
          {run.payslips.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/payslips/${p.id}`} className="link">{p.member.firstName} {p.member.lastName}</Link></td>
              <td>{Number(p.unpaidDays) || "–"}</td>
              <td className="text-right tabular-nums">{money(p.gross, cur)}</td>
              <td className="text-right tabular-nums">{money(p.gross - p.net, cur)}</td>
              <td className="text-right font-semibold tabular-nums">{money(p.net, cur)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
