import Link from "next/link";
import { api, type PayslipSummary } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { Card, Empty, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Payslips · Seamless Source HR" };

export default async function Payslips() {
  const { t, tag } = await getI18n();
  const slips = await api<PayslipSummary[]>("/payslips/mine");
  return (
    <>
      <PageHeader title={t("payslips.title")} sub={t("payslips.sub")} />
      <Card flush>
        {slips.length === 0 && <Empty>{t("payslips.none")}</Empty>}
        <ul className="rows">
          {slips.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-surface-2">
              <Link href={`/payslips/${p.id}`} className="link">{monthLabel(p.periodStart, tag)}</Link>
              <span className="flex items-center gap-4"><span className="tabular-nums text-muted">{t("payslips.net")} <span className="font-semibold text-ink">{money(p.net, p.currency)}</span></span><a className="link text-[13px]" href={`/payslips/${p.id}/pdf`} target="_blank" rel="noopener">{t("payslips.pdf")}</a></span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
