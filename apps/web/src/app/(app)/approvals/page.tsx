import { api, type Delegations, type LeaveRequest, type LeaveType, type Me, type Member } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, RowAction, Select } from "@/components/ui";
import { DecideForm } from "@/components/decide-form";
import { addDelegation, decideRequest, endDelegation } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Approvals · Seamless Source HR" };


export default async function Approvals() {
  const { t, tn, tag } = await getI18n();
  const [inbox, types, cover, members, me] = await Promise.all([
    api<LeaveRequest[]>("/requests/inbox"), api<LeaveType[]>("/leave-types"), api<Delegations>("/delegations"), api<Member[]>("/members"), api<Me>("/me"),
  ]);
  const others = members.filter((m) => m.status === "ACTIVE" && m.id !== me.id);
  const covering = cover.received.filter((c) => c.active);
  const fmt = (d: string) => new Date(d).toLocaleDateString(tag, { dateStyle: "medium" });
  return (
    <>
      <PageHeader title={t("approvals.title")} sub={inbox.length ? t("approvals.waitingN", { n: inbox.length }) : t("approvals.waiting")} />
      {covering.length > 0 && (
        <p role="status" className="mb-4 rounded-ui border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          {t("approvals.covering", { names: covering.map((c) => c.from.name).join(", "), date: fmt(covering[0].endsOn) })}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          {inbox.length === 0 && <Card><Empty>{t("approvals.caughtUp")}</Empty></Card>}
          <div className="grid gap-4 2xl:grid-cols-2">
            {inbox.map((r) => (
              <Card key={r.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.requester?.firstName} {r.requester?.lastName}</p>
                    <p className="text-sm text-muted">{r.type === "WFH" ? t("leave.wfh") : (types.find((x) => x.id === r.leaveTypeId)?.name ?? t("leave.leaveWord"))} · {tn("approvals.day", Number(r.days))}</p>
                  </div>
                  <p className="whitespace-nowrap rounded-ui bg-surface-2 px-2.5 py-1 text-right text-xs font-medium">{r.startDate.slice(0, 10)}{r.endDate !== r.startDate ? <><br />to {r.endDate.slice(0, 10)}</> : null}</p>
                </div>
                {r.teamOff && r.teamOff.off > 0 && (
                  <p role="status" className={`mb-3 rounded-ui border px-3 py-2 text-sm ${r.teamOff.off / r.teamOff.total >= 0.4 ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" : "border-line bg-surface-2 text-muted"}`}>
                    {t("approvals.teamOff", { off: r.teamOff.off, total: r.teamOff.total, verb: r.teamOff.off === 1 ? t("approvals.is") : t("approvals.are"), names: r.teamOff.names.join(", ") })}
                  </p>
                )}
                {r.reason && <p className="mb-3 rounded-ui bg-surface-2 p-3 text-sm">“{r.reason}”</p>}
                <DecideForm id={r.id} action={decideRequest} />
              </Card>
            ))}
          </div>
        </div>

        <Card title={t("approvals.goingAway")} sub={t("approvals.goingAwaySub")}>
          <ActionForm action={addDelegation} submit={t("approvals.askCover")} block>
            <Select label={t("approvals.whoCovers")} name="toId" required defaultValue="">
              <option value="" disabled>{t("approvals.choosePerson")}</option>
              {others.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("leave.from")} name="startsOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              <Field label={t("approvals.until")} name="endsOn" type="date" required />
            </div>
          </ActionForm>
          {cover.given.length > 0 && (
            <ul className="rows mt-5 text-sm">
              {cover.given.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span><span className="font-medium">{g.to.name}</span> <span className="text-muted">{fmt(g.startsOn)} to {fmt(g.endsOn)}</span> {g.active && <Badge tone="good">{t("approvals.active")}</Badge>}</span>
                  <RowAction action={endDelegation} id={g.id} label={t("approvals.end")} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
