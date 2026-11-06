import { api, type AuditItem } from "@/lib/api";
import { Empty, LinkButton, PageHeader, TableCard } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Activity log · Seamless Source HR" };

/** "document.issue" → "Document issue" */
const words = (a: string) => { const t = a.replace(/[._]/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

export default async function Activity({ searchParams }: { searchParams: Promise<{ before?: string; action?: string }> }) {
  await requireAny("audit.view");
  const { t: tr } = await getI18n();
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (/^\d+$/.test(sp.before ?? "")) qs.set("before", sp.before!);
  if (sp.action) qs.set("action", sp.action.slice(0, 40));
  const { items, next } = await api<{ items: AuditItem[]; next: string | null }>(`/audit?${qs}`);
  const more = new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(next ? { before: next } : {}) });
  return (
    <>
      <PageHeader title={tr("set.audit.title")} sub={tr("set.audit.sub")}>
        <form action="/settings/audit" className="flex gap-2">
          <select name="action" defaultValue={sp.action ?? ""} aria-label={tr("set.audit.type")} className="input w-auto min-w-44">
            <option value="">{tr("set.audit.all")}</option>
            {["document", "member", "permission", "payroll", "leave", "org", "role", "notice"].map((a) => <option key={a} value={a}>{words(a)}</option>)}
          </select>
          <button className="inline-flex min-h-10 items-center rounded-ui border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2" type="submit">{tr("calendar.apply")}</button>
        </form>
      </PageHeader>
      <TableCard>
        <thead><tr><th>{tr("set.audit.when")}</th><th>{tr("set.audit.who")}</th><th>{tr("set.audit.what")}</th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={3}><Empty>{tr("set.audit.none")}</Empty></td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap text-muted">{new Date(i.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="font-medium">{i.actor}</td>
              <td>{words(i.action)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {next && <div className="mt-4"><LinkButton variant="ghost" href={`/settings/audit?${more}`}>{tr("set.audit.older")}</LinkButton></div>}
      
    </>
  );
}
