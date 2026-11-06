import { api, type DocRequest, type DocTemplate, type IssuedDoc } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, Select, Split } from "@/components/ui";
import { requestDocument } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Documents · Seamless Source HR" };

const TONE = { PENDING: "warn", APPROVED: "good", REJECTED: "bad" } as const;

export default async function Documents() {
  const { t, tag } = await getI18n();
  const [docs, templates, requests] = await Promise.all([
    api<IssuedDoc[]>("/documents"), api<Pick<DocTemplate, "id" | "name">[]>("/document-templates/requestable"), api<DocRequest[]>("/document-requests/mine"),
  ]);
  return (
    <>
      <PageHeader title={t("docs.title")} sub={t("docs.sub")} />
      <Split>
        <div className="space-y-6">
          <Card title={t("docs.issued")} flush>
            {docs.length === 0 && <Empty>{t("docs.noneIssued")}</Empty>}
            <ul className="rows">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted">{new Date(d.issuedAt).toLocaleDateString(tag, { dateStyle: "medium" })} · {t("docs.code", { code: d.verifyCode })}</p>
                  </div>
                  <LinkButton href={`/documents/${d.id}/pdf`} target="_blank" rel="noopener" variant="ghost" size="sm">{t("docs.openPdf")}</LinkButton>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("docs.requests")} flush>
            {requests.length === 0 && <Empty>{t("docs.noRequests")}</Empty>}
            <ul className="rows">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span>{r.details.templateName}{r.reason ? <span className="text-muted"> · {r.reason}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    {r.status === "APPROVED" && !r.details.documentId && <span className="text-xs text-muted">{t("docs.waitingIssue")}</span>}
                    <Badge tone={TONE[r.status]}>{t(`docs.state.${r.status}`)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title={t("docs.request")} sub={t("docs.requestSub")}>
          {templates.length === 0 ? <p className="text-sm text-muted">{t("docs.noneRequestable")}</p> : (
            <ActionForm action={requestDocument} submit={t("docs.sendRequest")} block>
              <Select label={t("docs.document")} name="templateId" required>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Field label={t("docs.purpose")} name="purpose" maxLength={300} />
            </ActionForm>
          )}
        </Card>
      </Split>
    </>
  );
}
