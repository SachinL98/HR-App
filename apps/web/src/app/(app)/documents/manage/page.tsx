import Link from "next/link";
import { api, type DocPreview, type DocRequest, type DocTemplate, type IssuedDoc, type Member, type Seal } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, PageHeader, RowAction, Select } from "@/components/ui";
import { LetterheadFields } from "@/components/letterhead-fields";
import { TemplateForm } from "@/components/template-form";
import { requireAny } from "@/lib/guard";
import { addSeal, archiveTemplate, createTemplate, decideDocRequest, issueDocument, removeSeal, revokeDocument, updateLetterhead } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Manage documents · Seamless Source HR" };



export default async function ManageDocuments({ searchParams }: { searchParams: Promise<{ templateId?: string; memberId?: string; requestId?: string }> }) {
  const sp = await searchParams;
  const { t: tr } = await getI18n();
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
      <PageHeader title={tr("md.title")} sub={tr("md.sub")} back={{ href: "/documents", label: tr("md.back") }} />

      {inbox.length > 0 && (
        <Card className="mb-6" title={tr("md.waiting")} sub={tr("md.toReview", { n: inbox.length })}>
          <ul className="space-y-3">
            {inbox.map((r) => (
              <li key={r.id} className="rounded-ui border border-line bg-surface-2 p-4 text-sm">
                <p><span className="font-medium">{tr("md.asks", { name: `${r.requester.firstName} ${r.requester.lastName}`, doc: r.details.templateName })}</span>{r.reason ? ` (${r.reason})` : ""}</p>
                <ActionForm action={decideDocRequest} submit={tr("md.approve")} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="APPROVED" />
                </ActionForm>
                <ActionForm action={decideDocRequest} submit={tr("md.decline")} variant="ghost" className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="REJECTED" />
                  <input name="comment" required placeholder={tr("md.reason")} aria-label={tr("md.reason")} className="input w-56" />
                </ActionForm>
                {issuer && <Link className="link mt-2 inline-block" href={`/documents/manage?templateId=${r.details.templateId}&memberId=${r.requester.id}&requestId=${r.id}`}>{tr("md.issueIt")}</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {issuer && (
        <Card className="mb-6" title={tr("md.issue")} sub={tr("md.issueSub")}>
          <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action="/documents/manage">
            <Select label={tr("md.template")} name="templateId" defaultValue={sp.templateId ?? ""} required><option value="" disabled>{tr("md.choose")}</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Select label={tr("md.for")} name="memberId" defaultValue={sp.memberId ?? ""} required><option value="" disabled>{tr("md.choose")}</option>{people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
            {sp.requestId && <input type="hidden" name="requestId" value={sp.requestId} />}
            <Button variant="ghost" type="submit">{tr("md.preview")}</Button>
          </form>
          {preview && "error" in preview && <p role="alert" className="text-sm text-red-600">{preview.error}</p>}
          {preview && "text" in preview && preview.missing.length > 0 && (
            <p role="alert" className="mb-4 rounded-ui border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {tr("md.cannotIssue", { what: preview.missing.join(", ") })} <Link className="link" href="/people">{tr("people.title")}</Link>
            </p>
          )}
          {preview && "text" in preview && (
            <>
              <iframe title={tr("md.preview")} src={`/documents/preview/pdf?templateId=${sp.templateId}&memberId=${sp.memberId}#toolbar=0`}
                className="mb-4 h-[46rem] w-full max-w-3xl rounded-ui border border-line bg-surface-2" />
              <p className="-mt-2 mb-4 text-xs text-muted">{tr("md.previewNote")} <a className="link" href={`/documents/preview/pdf?templateId=${sp.templateId}&memberId=${sp.memberId}`} target="_blank" rel="noopener">{tr("md.openTab")}</a></p>
              <ActionForm action={issueDocument} submit={tr("md.issueBtn")} variant={preview.missing.length ? "ghost" : undefined}>
                <input type="hidden" name="templateId" value={sp.templateId} /><input type="hidden" name="memberId" value={sp.memberId} />
                {sp.requestId && <input type="hidden" name="requestId" value={sp.requestId} />}
                {(preview.needsStamp || preview.needsSignatures.length > 0) && <p className="text-sm font-medium">{tr("md.apply")}</p>}
                {seals.filter((s) => (s.kind === "stamp" && preview.needsStamp) || (s.kind === "signature" && preview.needsSignatures.includes(s.token.slice(12, -2)))).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sealIds" value={s.id} defaultChecked /> {s.label}</label>
                ))}
              </ActionForm>
            </>
          )}
          <h3 className="mb-2 mt-8 text-sm font-semibold">{tr("md.recent")}</h3>
          <ul className="rows text-sm">
            {issued.slice(0, 15).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>{d.name} · {d.subject.firstName} {d.subject.lastName} {d.revokedAt && <Badge tone="warn">{tr("md.revoked")}</Badge>}</span>
                <span className="flex items-center gap-3">
                  <a className="link" href={`/documents/${d.id}/pdf`} target="_blank" rel="noopener">PDF</a>
                  {!d.revokedAt && <RowAction action={revokeDocument} id={d.id} label={tr("md.revoke")} variant="danger" />}
                </span>
              </li>
            ))}
            {issued.length === 0 && <li className="text-muted">{tr("md.nothingIssued")}</li>}
          </ul>
        </Card>
      )}

      {can("document.template.manage") && (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card title={tr("md.templates")}>
            <ul className="rows mb-5 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{t.name} {t.fileId && <Badge tone="info">{tr("md.hasLetterhead")}</Badge>} {t.requestable && <Badge tone="good">{tr("md.requestable")}</Badge>}</span>
                    <span className="flex items-center gap-2"><Link href={`/documents/manage/templates/${t.id}`} className="link text-[13px]">{tr("md.editText")}</Link><RowAction action={archiveTemplate} id={t.id} label={tr("md.archive")} /></span>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">{t.fileId ? tr("md.changeLetterhead") : tr("md.addLetterhead")}</summary>
                    <ActionForm action={updateLetterhead} submit={tr("md.saveLetterhead")} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={t.id} />
                      <LetterheadFields layout={t.layout} hasLetterhead={!!t.fileId} />
                      {t.fileId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLetterhead" /> {tr("md.removeLetterhead")}</label>}
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
            <TemplateForm action={createTemplate} fields={fields} />
          </Card>
          <Card title={tr("md.seals")}>
            <ul className="rows mb-5 text-sm">
              {seals.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{s.label} <code className="text-xs text-muted">{s.token}</code></span>
                  <RowAction action={removeSeal} id={s.id} label={tr("set.remove")} />
                </li>
              ))}
              {seals.length === 0 && <li className="text-muted">{tr("md.none")}</li>}
            </ul>
            <ActionForm action={addSeal} submit={tr("md.upload")}>
              <Select label={tr("md.kind")} name="kind" defaultValue="stamp"><option value="stamp">{tr("md.stamp")}</option><option value="signature">{tr("md.signature")}</option></Select>
              <Field label={tr("md.label")} name="label" required maxLength={60} placeholder="HR Manager" />
              <Select label={tr("md.signatory")} name="signatoryId" defaultValue=""><option value="">{tr("md.stampNobody")}</option>{people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}</Select>
              <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-medium">{tr("md.png")}</span><input type="file" name="image" accept="image/png" required className="input py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" />
                <span className="mt-1 block text-xs text-muted">{tr("md.pngHint")}</span></label>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
