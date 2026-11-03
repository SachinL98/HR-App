import Link from "next/link";
import { api, type DocPreview, type DocRequest, type DocTemplate, type IssuedDoc, type Member, type Seal } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, Select } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { addSeal, archiveTemplate, createTemplate, decideDocRequest, issueDocument, removeSeal, revokeDocument } from "../../../actions";

export const metadata = { title: "Manage documents · HR App" };

const STARTER = `To whom it may concern

This letter confirms that {{member.full_name}} works at {{company.name}} as {{member.job_title}} in the {{member.department}} department, and has done so since {{member.start_date}}.

Issued on {{today}}.

{{signature.hr_manager}}
{{stamp}}`;

export default async function ManageDocuments({ searchParams }: { searchParams: Promise<{ templateId?: string; memberId?: string; requestId?: string }> }) {
  const sp = await searchParams;
  const me = await requireAny("document.issue", "document.template.manage", "document.request.approve");
  const can = (p: string) => me.permissions.includes(p);
  const issuer = can("document.issue");
  const [templates, seals, members, issued, inbox, fields] = await Promise.all([
    issuer ? api<DocTemplate[]>("/document-templates") : [], issuer ? api<Seal[]>("/seals") : [], api<Member[]>("/members"),
    issuer ? api<IssuedDoc[]>("/documents") : [], api<(DocRequest & { requester: { id: string; firstName: string; lastName: string } })[]>("/document-requests/inbox"),
    api<{ name: string; label: string }[]>("/document-fields"),
  ]);
  const people = members.filter((m) => m.status === "ACTIVE");
  const preview = issuer && sp.templateId && sp.memberId
    ? await api<DocPreview>("/documents/preview", { body: { templateId: sp.templateId, memberId: sp.memberId } }).catch((e: Error) => ({ error: e.message }))
    : null;

  return (
    <>
      <PageHeader title="Manage documents" sub="Templates, stamp and signatures, and issuing letters.">
        <Link href="/documents" className="text-sm text-primary underline">← My documents</Link>
      </PageHeader>

      {inbox.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Requests waiting</h2>
          <ul className="space-y-3">
            {inbox.map((r) => (
              <li key={r.id} className="rounded-ui border border-line p-3 text-sm">
                <p><span className="font-medium">{r.requester.firstName} {r.requester.lastName}</span> asks for {r.details.templateName}{r.reason ? ` (${r.reason})` : ""}</p>
                <ActionForm action={decideDocRequest} submit="Approve" className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="APPROVED" />
                </ActionForm>
                <ActionForm action={decideDocRequest} submit="Decline" variant="ghost" className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="REJECTED" />
                  <input name="comment" required placeholder="Reason" className="rounded-ui border border-line bg-surface px-3 py-1.5" />
                </ActionForm>
                {issuer && <Link className="mt-2 inline-block text-primary underline" href={`/documents/manage?templateId=${r.details.templateId}&memberId=${r.requester.id}&requestId=${r.id}`}>Issue it</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {issuer && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Issue a document</h2>
          <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action="/documents/manage">
            <Select label="Template" name="templateId" defaultValue={sp.templateId ?? ""} required><option value="" disabled>Choose…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Select label="For" name="memberId" defaultValue={sp.memberId ?? ""} required><option value="" disabled>Choose…</option>{people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
            {sp.requestId && <input type="hidden" name="requestId" value={sp.requestId} />}
            <button className="rounded-ui border border-line bg-surface px-4 py-2 text-sm">Preview</button>
          </form>
          {preview && "error" in preview && <p role="alert" className="text-sm text-red-600">{preview.error}</p>}
          {preview && "text" in preview && (
            <>
              <pre className="mb-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-ui bg-bg p-4 font-sans text-sm">{preview.text}</pre>
              <ActionForm action={issueDocument} submit="Issue as PDF">
                <input type="hidden" name="templateId" value={sp.templateId} /><input type="hidden" name="memberId" value={sp.memberId} />
                {sp.requestId && <input type="hidden" name="requestId" value={sp.requestId} />}
                {(preview.needsStamp || preview.needsSignatures.length > 0) && <p className="text-sm font-medium">Apply</p>}
                {seals.filter((s) => (s.kind === "stamp" && preview.needsStamp) || (s.kind === "signature" && preview.needsSignatures.includes(s.token.slice(12, -2)))).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sealIds" value={s.id} defaultChecked /> {s.label}</label>
                ))}
              </ActionForm>
            </>
          )}
          <h3 className="mb-1 mt-6 text-sm font-semibold">Recently issued</h3>
          <ul className="text-sm">
            {issued.slice(0, 15).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-t border-line py-2">
                <span>{d.name} · {d.subject.firstName} {d.subject.lastName} {d.revokedAt && <Badge tone="warn">revoked</Badge>}</span>
                <span className="flex items-center gap-3">
                  <a className="text-primary underline" href={`/documents/${d.id}/pdf`} target="_blank" rel="noopener">PDF</a>
                  {!d.revokedAt && <form action={revokeDocument}><input type="hidden" name="id" value={d.id} /><button className="text-red-600 underline">Revoke</button></form>}
                </span>
              </li>
            ))}
            {issued.length === 0 && <li className="text-muted">Nothing issued yet.</li>}
          </ul>
        </Card>
      )}

      {can("document.template.manage") && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold">Templates</h2>
            <ul className="mb-4 space-y-1 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b border-line py-1.5">
                  <span>{t.name} {t.requestable && <Badge tone="good">requestable</Badge>}</span>
                  <form action={archiveTemplate}><input type="hidden" name="id" value={t.id} /><button className="text-red-600 underline">Archive</button></form>
                </li>
              ))}
            </ul>
            <ActionForm action={createTemplate} submit="Save template">
              <Field label="Name" name="name" required maxLength={80} />
              <Select label="Type" name="kind" defaultValue="confirmation">
                <option value="confirmation">Employment confirmation</option><option value="experience">Experience letter</option><option value="offer">Offer</option>
                <option value="contract">Contract</option><option value="salary_cert">Salary certificate</option><option value="custom">Other</option>
              </Select>
              <label className="block text-sm"><span className="mb-1 block font-medium">Text</span>
                <textarea name="body" rows={9} required defaultValue={STARTER} className="w-full rounded-ui border border-line bg-surface px-3 py-2 font-mono text-xs" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requestable" /> Employees can request this</label>
              <p className="text-xs text-muted">Fields you can use: {fields.map((f) => `{{${f.name}}}`).join(" ")} {"{{stamp}} {{signature.name}}"}</p>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Stamp and signatures</h2>
            <ul className="mb-4 space-y-1 text-sm">
              {seals.map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b border-line py-1.5">
                  <span>{s.label} <code className="text-xs text-muted">{s.token}</code></span>
                  <form action={removeSeal}><input type="hidden" name="id" value={s.id} /><button className="text-red-600 underline">Remove</button></form>
                </li>
              ))}
              {seals.length === 0 && <li className="text-muted">None yet.</li>}
            </ul>
            <ActionForm action={addSeal} submit="Upload">
              <Select label="Kind" name="kind" defaultValue="stamp"><option value="stamp">Company stamp</option><option value="signature">Signature</option></Select>
              <Field label="Label" name="label" required maxLength={60} placeholder="HR Manager" />
              <Select label="Signature belongs to" name="signatoryId" defaultValue=""><option value="">(stamp: nobody)</option>{people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
              <label className="block text-sm"><span className="mb-1 block font-medium">PNG image</span><input type="file" name="image" accept="image/png" required className="w-full text-sm" />
                <span className="mt-1 block text-xs text-muted">A transparent background looks best. Stored encrypted.</span></label>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
