import { api, type Department, type Me, type Notice } from "@/lib/api";
import { NoticeForm } from "@/components/notice-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { publishNotice, readNotice } from "../../actions";

export const metadata = { title: "Notices · HR App" };

export default async function Notices() {
  const [me, notices, departments] = await Promise.all([api<Me>("/me"), api<Notice[]>("/notices"), api<Department[]>("/departments")]);
  const canPublish = me.permissions.includes("notice.publish");
  return (
    <>
      <PageHeader title="Notices" sub="Announcements from your company." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {notices.length === 0 && <Card><p className="text-sm text-muted">No notices yet.</p></Card>}
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{n.title}</h2>
                {n.important && <Badge tone="warn">Important</Badge>}
                {!n.readAt && n.authorId !== me.id && <Badge tone="good">New</Badge>}
              </div>
              <p className="text-xs text-muted">{new Date(n.publishAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
              {/* Plain text only: React escapes it, and whitespace is kept. */}
              <p className="mt-3 whitespace-pre-wrap text-sm">{n.body}</p>
              {n.authorId !== me.id && (
                <div className="mt-4 flex gap-2">
                  {n.requireAck && !n.ackAt && (
                    <form action={readNotice}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="acknowledge" value="1" />
                      <button className="rounded-ui bg-primary px-3 py-1.5 text-sm text-primary-fg">I have read this</button></form>
                  )}
                  {n.requireAck && n.ackAt && <Badge tone="good">Acknowledged</Badge>}
                  {!n.requireAck && !n.readAt && (
                    <form action={readNotice}><input type="hidden" name="id" value={n.id} />
                      <button className="rounded-ui border border-line px-3 py-1.5 text-sm">Mark as read</button></form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
        {canPublish && (
          <Card>
            <h2 className="mb-3 font-semibold">Publish a notice</h2>
            <NoticeForm action={publishNotice} departments={departments.map((d) => ({ id: d.id, name: d.name }))} />
          </Card>
        )}
      </div>
    </>
  );
}
