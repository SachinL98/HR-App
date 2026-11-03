import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type PayslipDetail } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";

export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await api<PayslipDetail>(`/payslips/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  const group = (kind: string) => p.lines.filter((l) => l.kind === kind);
  const section = (title: string, kind: string) => group(kind).length === 0 ? null : (
    <div className="mb-5" key={kind}>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="text-sm">{group(kind).map((l) => <li key={l.code} className="flex justify-between border-b border-line py-1.5"><span>{l.label}</span><span>{money(l.amount, p.currency)}</span></li>)}</ul>
    </div>
  );
  return (
    <>
      <PageHeader title={`Payslip · ${monthLabel(p.periodStart)}`} sub={`${p.member.firstName} ${p.member.lastName}`}>
        <Link href="/payslips" className="text-sm text-primary underline">← My payslips</Link>
      </PageHeader>
      <Card className="max-w-2xl">
        {section("Earnings", "earning")}
        {section("Deductions", "deduction")}
        <div className="mb-5 flex justify-between rounded-ui bg-bg p-3 font-semibold"><span>Net pay</span><span>{money(p.net, p.currency)}</span></div>
        {section("Employer contributions (not deducted from you)", "employer")}
        {p.ruleVersion && <p className="text-xs text-muted">Calculated with {p.ruleVersion} rules.</p>}
      </Card>
    </>
  );
}
