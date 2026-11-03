import { api, type Balance, type LeaveRequest, type LeaveType } from "@/lib/api";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { cancelRequest, requestTime } from "../../actions";

export const metadata = { title: "Leave & WFH · HR App" };

const TONE = { APPROVED: "good", PENDING: "warn", CHANGES_REQUESTED: "warn", REJECTED: "neutral", CANCELED: "neutral", DRAFT: "neutral" } as const;

export default async function Leave() {
  const [balances, mine, types] = await Promise.all([
    api<Balance[]>("/balances/me"), api<LeaveRequest[]>("/requests/mine"), api<LeaveType[]>("/leave-types"),
  ]);
  return (
    <>
      <PageHeader title="Leave & work from home" sub="Your balances, requests and their approval status." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {balances.filter((b) => b.entitled !== null).map((b) => (
          <Card key={b.key}>
            <p className="text-sm text-muted">{b.label}</p>
            <p className="mt-1 text-3xl font-semibold">{b.remaining}<span className="text-base font-normal text-muted"> of {b.entitled} left</span></p>
            <p className="text-xs text-muted">{b.used} used{b.pending ? `, ${b.pending} waiting for approval` : ""} · this {b.period === "MONTH" ? "month" : "year"}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted">
              <tr><th className="p-3">Request</th><th className="p-3">Dates</th><th className="p-3">Days</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {mine.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">No requests yet.</td></tr>}
              {mine.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="p-3 font-medium">{r.type === "WFH" ? "Work from home" : types.find((t) => t.id === r.leaveTypeId)?.name ?? "Leave"}</td>
                  <td className="p-3">{r.startDate.slice(0, 10)}{r.endDate !== r.startDate ? ` to ${r.endDate.slice(0, 10)}` : ""}</td>
                  <td className="p-3">{r.days}</td>
                  <td className="p-3">
                    <Badge tone={TONE[r.status]}>{r.status.replace("_", " ").toLowerCase()}</Badge>
                    {r.actions.filter((a) => a.comment).map((a) => <p key={a.id} className="mt-1 text-xs text-muted">“{a.comment}”</p>)}
                  </td>
                  <td className="p-3 text-right">
                    {["PENDING", "APPROVED", "CHANGES_REQUESTED"].includes(r.status) && (
                      <form action={cancelRequest}><input type="hidden" name="id" value={r.id} /><Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Cancel</Button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">New request</h2>
          <RequestForm action={requestTime} leaveTypes={types.filter((t) => t.active)} />
        </Card>
      </div>
    </>
  );
}
