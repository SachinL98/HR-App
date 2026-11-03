import Link from "next/link";
import { api, type PayslipSummary } from "@/lib/api";
import { money, monthLabel } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Payslips · HR App" };

export default async function Payslips() {
  const slips = await api<PayslipSummary[]>("/payslips/mine");
  return (
    <>
      <PageHeader title="My payslips" sub="Issued by your company's payroll." />
      <Card className="p-0">
        {slips.length === 0 && <p className="p-5 text-sm text-muted">No payslips yet.</p>}
        <ul>
          {slips.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-line p-4 text-sm last:border-0">
              <Link href={`/payslips/${p.id}`} className="font-medium hover:underline">{monthLabel(p.periodStart)}</Link>
              <span>Net pay {money(p.net, p.currency)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
