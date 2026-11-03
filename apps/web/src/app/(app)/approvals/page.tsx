import { api, type LeaveRequest, type LeaveType } from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";
import { DecideForm } from "@/components/decide-form";
import { decideRequest } from "../../actions";

export const metadata = { title: "Approvals · HR App" };

export default async function Approvals() {
  const [inbox, types] = await Promise.all([api<LeaveRequest[]>("/requests/inbox"), api<LeaveType[]>("/leave-types")]);
  return (
    <>
      <PageHeader title="Approvals" sub="Requests waiting for your decision." />
      {inbox.length === 0 && <Card><p className="text-sm text-muted">Nothing is waiting for you.</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {inbox.map((r) => (
          <Card key={r.id}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.requester?.firstName} {r.requester?.lastName}</p>
                <p className="text-sm text-muted">{r.type === "WFH" ? "Work from home" : (types.find((t) => t.id === r.leaveTypeId)?.name ?? "Leave")} · {r.days} day{Number(r.days) === 1 ? "" : "s"}</p>
              </div>
              <p className="text-right text-sm">{r.startDate.slice(0, 10)}{r.endDate !== r.startDate ? <><br />to {r.endDate.slice(0, 10)}</> : null}</p>
            </div>
            {r.reason && <p className="mb-3 text-sm">“{r.reason}”</p>}
            <DecideForm id={r.id} action={decideRequest} />
          </Card>
        ))}
      </div>
    </>
  );
}
