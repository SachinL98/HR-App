import { notFound } from "next/navigation";
import { api, ApiError, type PayslipDetail } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, tag } = await getI18n();
  const p = await api<PayslipDetail>(`/payslips/${id}`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  const group = (kind: string) => p.lines.filter((l) => l.kind === kind);
  const section = (title: string, kind: string) => group(kind).length === 0 ? null : (
    <div className="mb-5" key={kind}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <ul className="text-sm">{group(kind).map((l) => <li key={l.code} className="flex justify-between border-b border-line py-2 tabular-nums"><span>{l.label}</span><span>{money(l.amount, p.currency)}</span></li>)}</ul>
    </div>
  );
  return (
    <>
      <PageHeader title={t("slip.title", { period: monthLabel(p.periodStart, tag) })} sub={`${p.member.firstName} ${p.member.lastName}`} back={{ href: "/payslips", label: t("slip.back") }}>
        <LinkButton href={`/payslips/${p.id}/pdf`} target="_blank" rel="noopener" variant="ghost">{t("payslips.download")}</LinkButton>
      </PageHeader>
      <Card className="max-w-3xl">
        {section(t("slip.earnings"), "earning")}
        {section(t("slip.deductions"), "deduction")}
        <div className="mb-5 flex justify-between rounded-ui bg-surface-2 p-4 text-base font-semibold tabular-nums"><span>{t("payslips.net")}</span><span>{money(p.net, p.currency)}</span></div>
        {section(t("slip.employer"), "employer")}
        {p.ruleVersion && <p className="text-xs text-muted">{t("slip.rules", { v: p.ruleVersion })}</p>}
      </Card>
    </>
  );
}
