import { api, type DocRequest, type DocTemplate, type IssuedDoc } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, Select } from "@/components/ui";
import { requestDocument } from "../../actions";

export const metadata = { title: "Documents · HR App" };

const TONE = { PENDING: "warn", APPROVED: "good", REJECTED: "neutral" } as const;

export default async function Documents() {
  const [docs, templates, requests] = await Promise.all([
    api<IssuedDoc[]>("/documents"), api<Pick<DocTemplate, "id" | "name">[]>("/document-templates/requestable"), api<DocRequest[]>("/document-requests/mine"),
  ]);
  return (
    <>
      <PageHeader title="My documents" sub="Letters and certificates issued to you." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-0">
            <h2 className="p-4 pb-2 font-semibold">Issued to you</h2>
            {docs.length === 0 && <p className="p-4 pt-0 text-sm text-muted">Nothing yet.</p>}
            <ul>
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-t border-line p-4 text-sm">
                  <span><span className="font-medium">{d.name}</span><br /><span className="text-xs text-muted">{new Date(d.issuedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })} · code {d.verifyCode}</span></span>
                  <a href={`/documents/${d.id}/pdf`} target="_blank" rel="noopener" className="text-primary underline">Open PDF</a>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-0">
            <h2 className="p-4 pb-2 font-semibold">Your requests</h2>
            {requests.length === 0 && <p className="p-4 pt-0 text-sm text-muted">No requests.</p>}
            <ul>
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-t border-line p-4 text-sm">
                  <span>{r.details.templateName}{r.reason ? <span className="text-muted"> · {r.reason}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    {r.status === "APPROVED" && !r.details.documentId && <span className="text-xs text-muted">waiting to be issued</span>}
                    <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">Request a document</h2>
          {templates.length === 0 ? <p className="text-sm text-muted">Your company has not made any documents available to request yet.</p> : (
            <ActionForm action={requestDocument} submit="Send request">
              <Select label="Document" name="templateId" required>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Field label="What is it for? (optional)" name="purpose" maxLength={300} />
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
