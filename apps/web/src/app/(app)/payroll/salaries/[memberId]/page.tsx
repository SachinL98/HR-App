import { notFound } from "next/navigation";
import { api, ApiError, type SalaryHistory } from "@/lib/api";
import { money } from "@/lib/money";
import { Empty, PageHeader, TableCard } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Pay history · Seamless Source HR" };

export default async function History({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  await requireAny("payroll.view", "payroll.manage");
  const { t: tr, tag } = await getI18n();
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) notFound();
  const h = await api<SalaryHistory>(`/members/${memberId}/salary/history`).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  return (
    <>
      <PageHeader title={`${h.member.firstName} ${h.member.lastName}`} sub={tr("sal.hist.sub")} back={{ href: "/payroll/salaries", label: tr("sal.title") }} />
      <TableCard>
        <thead><tr><th>{tr("sal.hist.changed")}</th><th>{tr("sal.hist.by")}</th><th className="text-right">{tr("sal.basic")}</th><th>{tr("sal.effective")}</th><th>{tr("sal.hist.reason")}</th></tr></thead>
        <tbody>
          {h.changes.length === 0 && <tr><td colSpan={5}><Empty>{tr("sal.hist.none")}</Empty></td></tr>}
          {h.changes.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-muted">{new Date(c.at).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="font-medium">{c.by}</td>
              <td className="text-right tabular-nums">{money(c.basic, c.payGroup?.currency ?? "GBP")}</td>
              <td className="whitespace-nowrap">{c.effectiveFrom.slice(0, 10)}</td>
              <td>{c.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
