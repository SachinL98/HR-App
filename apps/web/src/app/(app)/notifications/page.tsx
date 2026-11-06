import Link from "next/link";
import { api, type NotificationList } from "@/lib/api";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { readAllNotifications } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Notifications · Seamless Source HR" };

export default async function Notifications() {
  const { t, tag } = await getI18n();
  const { items, unreadCount } = await api<NotificationList>("/notifications");
  return (
    <>
      <PageHeader title={t("notifications.title")} sub={unreadCount ? t("notifications.unread", { n: unreadCount }) : t("notifications.caughtUp")}>
        {unreadCount > 0 && <form action={readAllNotifications}><Button variant="ghost" type="submit">{t("notifications.markAll")}</Button></form>}
      </PageHeader>
      <Card flush>
        {items.length === 0 && <Empty>{t("notifications.none")}</Empty>}
        <ul className="rows">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-primary/5"}`}>
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>
                    {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                  </p>
                  <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString(tag, { dateStyle: "short", timeStyle: "short" })}</time>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
