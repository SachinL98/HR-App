import { api, type Balance, type LeaveRequest, type LeaveType } from "@/lib/api";
import { Badge, Button, Card, Empty, PageHeader, Split, TableCard } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { cancelRequest, requestTime } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Leave & WFH · Seamless Source HR" };

const TONE = { APPROVED: "good", PENDING: "warn", CHANGES_REQUESTED: "warn", REJECTED: "bad", CANCELED: "neutral", DRAFT: "neutral" } as const;

export default async function Leave() {
  const { t, tag } = await getI18n();
  const [balances, mine, types] = await Promise.all([
    api<Balance[]>("/balances/me"), api<LeaveRequest[]>("/requests/mine"), api<LeaveType[]>("/leave-types"),
  ]);
  return (
    <>
      <PageHeader title={t("leave.title")} sub={t("leave.sub")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.filter((b) => b.entitled !== null).map((b) => (
          <Card key={b.key}>
            <p className="text-[13px] font-medium text-muted">{b.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{b.remaining}<span className="text-sm font-normal text-muted"> {t("home.ofLeft", { n: b.entitled ?? 0 })}</span></p>
            <p className="mt-1 text-xs text-muted">{t("leave.used", { n: b.used })}{b.pending ? t("leave.pendingN", { n: b.pending }) : ""} · {b.period === "MONTH" ? t("leave.thisMonth") : t("leave.thisYear")}</p>
            {b.carriedOver > 0 && (
              <p className="mt-1 text-xs text-muted">
                {t("leave.carried", { n: b.carriedLeft })}{b.carryExpires ? (b.carriedLeft > 0 ? t("leave.carriedUseBy", { date: new Date(b.carryExpires).toLocaleDateString(tag, { day: "numeric", month: "short" }) }) : t("leave.carriedExpired")) : ""}.
              </p>
            )}
            {b.accrual === "monthly" && b.yearly !== null && <p className="mt-1 text-xs text-muted">{t("leave.accrues", { n: b.yearly })}</p>}
          </Card>
        ))}
      </div>
      <Split>
        <TableCard>
          <thead>
            <tr><th>{t("leave.request")}</th><th>{t("leave.dates")}</th><th>{t("leave.days")}</th><th>{t("leave.status")}</th><th /></tr>
          </thead>
          <tbody>
            {mine.length === 0 && <tr><td colSpan={5}><Empty>{t("leave.none")}</Empty></td></tr>}
            {mine.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="font-medium">{r.type === "WFH" ? t("leave.wfh") : types.find((x) => x.id === r.leaveTypeId)?.name ?? t("leave.leaveWord")}</td>
                <td className="whitespace-nowrap">{r.startDate.slice(0, 10)}{r.endDate !== r.startDate ? ` to ${r.endDate.slice(0, 10)}` : ""}</td>
                <td>{r.days}</td>
                <td>
                  <Badge tone={TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
                  {r.actions.filter((a) => a.comment).map((a) => <p key={a.id} className="mt-1 text-xs text-muted">“{a.comment}”</p>)}
                </td>
                <td className="text-right">
                  {["PENDING", "APPROVED", "CHANGES_REQUESTED"].includes(r.status) && (
                    <form action={cancelRequest}><input type="hidden" name="id" value={r.id} /><Button variant="ghost" size="sm" type="submit">{t("leave.cancel")}</Button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        <Card title={t("leave.newRequest")} sub={t("leave.newRequestSub")}>
          <RequestForm action={requestTime} leaveTypes={types.filter((x) => x.active)} />
        </Card>
      </Split>
    </>
  );
}
