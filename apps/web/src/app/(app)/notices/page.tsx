import { api, type Department, type Me, type Notice } from "@/lib/api";
import { NoticeForm } from "@/components/notice-form";
import { Badge, Button, Card, Empty, PageHeader, Split } from "@/components/ui";
import { publishNotice, readNotice } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Notices · Seamless Source HR" };

export default async function Notices() {
  const { t, tag } = await getI18n();
  const [me, notices, departments] = await Promise.all([api<Me>("/me"), api<Notice[]>("/notices"), api<Department[]>("/departments")]);
  const canPublish = me.permissions.includes("notice.publish");
  return (
    <>
      <PageHeader title={t("notices.title")} sub={t("notices.sub")} />
      <Split>
        <div className="space-y-4">
          {notices.length === 0 && <Card><Empty>{t("notices.none")}</Empty></Card>}
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{n.title}</h2>
                {n.important && <Badge tone="warn">{t("notices.important")}</Badge>}
                {!n.readAt && n.authorId !== me.id && <Badge tone="info">{t("notices.new")}</Badge>}
              </div>
              <p className="text-xs text-muted">{new Date(n.publishAt).toLocaleDateString(tag, { dateStyle: "medium" })}</p>
              {/* Plain text only: React escapes it, and whitespace is kept. */}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{n.body}</p>
              {n.authorId !== me.id && (
                <div className="mt-4 flex gap-2">
                  {n.requireAck && !n.ackAt && (
                    <form action={readNotice}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="acknowledge" value="1" />
                      <Button type="submit" size="sm">{t("notices.read")}</Button></form>
                  )}
                  {n.requireAck && n.ackAt && <Badge tone="good">{t("notices.acknowledged")}</Badge>}
                  {!n.requireAck && !n.readAt && (
                    <form action={readNotice}><input type="hidden" name="id" value={n.id} />
                      <Button type="submit" variant="ghost" size="sm">{t("notices.markRead")}</Button></form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
        {canPublish && (
          <Card title={t("notices.publish")}>
            <NoticeForm action={publishNotice} departments={departments.map((d) => ({ id: d.id, name: d.name }))} />
          </Card>
        )}
      </Split>
    </>
  );
}
