import Link from "next/link";
import { api, type NotificationList } from "@/lib/api";
import { Button, Card, PageHeader } from "@/components/ui";
import { readAllNotifications } from "../../actions";

export const metadata = { title: "Notifications · HR App" };

export default async function Notifications() {
  const { items, unreadCount } = await api<NotificationList>("/notifications");
  return (
    <>
      <PageHeader title="Notifications" sub={unreadCount ? `${unreadCount} unread` : "You are all caught up."}>
        {unreadCount > 0 && <form action={readAllNotifications}><Button variant="ghost" type="submit">Mark all as read</Button></form>}
      </PageHeader>
      <Card className="p-0">
        {items.length === 0 && <p className="p-5 text-sm text-muted">Nothing yet.</p>}
        <ul>
          {items.map((n) => (
            <li key={n.id} className={`border-b border-line p-4 last:border-0 ${n.readAt ? "" : "bg-primary/5"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>
                  {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                </p>
                <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</time>
              </div>
              {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
