import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type PayrollRunDetail } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { moveRun } from "../../../../actions";

const NEXT = {
  DRAFT: [{ step: "submit", label: "Send for review" }],
  IN_REVIEW: [{ step: "approve", label: "Approve" }, { step: "reopen", label: "Send back to draft", ghost: true }],
  APPROVED: [{ step: "finalize", label: "Finalise and issue payslips" }, { step: "reopen", label: "Send back to draft", ghost: true }],
  FINALIZED: [],
} as const;

export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAny("payroll.view", "payroll.manage");
  const run = await api<PayrollRunDetail>(`/payroll/runs/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  const cur = run.payGroup.currency;
  const manage = me.permissions.includes("payroll.manage");
  return (
    <>
      <PageHeader title={`${monthLabel(run.periodStart)} · ${run.payGroup.name}`} sub={run.ruleVersion ? `Rules: ${run.ruleVersion}` : "No statutory rules"}>
        <Link href="/payroll" className="text-sm text-primary underline">← All runs</Link>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[["Gross pay", run.totals.gross], ["Net pay", run.totals.net], ["Total cost to company", run.totals.employerCost]].map(([l, v]) => (
          <Card key={l as string}><p className="text-sm text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{money(v as number, cur)}</p></Card>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Badge tone={run.status === "FINALIZED" ? "good" : "warn"}>{run.status.replace("_", " ").toLowerCase()}</Badge>
        {manage && NEXT[run.status].map((n) => (
          <form key={n.step} action={moveRun}>
            <input type="hidden" name="id" value={run.id} /><input type="hidden" name="step" value={n.step} />
            <button className={`rounded-ui px-3 py-1.5 text-sm ${"ghost" in n ? "border border-line" : "bg-primary text-primary-fg"}`}>{n.label}</button>
          </form>
        ))}
        {manage && (run.status === "DRAFT") && (
          <form action={moveRun}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="step" value="recompute" />
            <button className="rounded-ui border border-line px-3 py-1.5 text-sm">Recalculate</button></form>
        )}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Person</th><th className="p-3 font-medium">Unpaid days</th><th className="p-3 text-right font-medium">Gross</th><th className="p-3 text-right font-medium">Deductions</th><th className="p-3 text-right font-medium">Net</th></tr></thead>
          <tbody>
            {run.payslips.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3"><Link href={`/payslips/${p.id}`} className="font-medium hover:underline">{p.member.firstName} {p.member.lastName}</Link></td>
                <td className="p-3">{Number(p.unpaidDays) || "–"}</td>
                <td className="p-3 text-right">{money(p.gross, cur)}</td>
                <td className="p-3 text-right">{money(p.gross - p.net, cur)}</td>
                <td className="p-3 text-right font-medium">{money(p.net, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
