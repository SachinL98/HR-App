import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, type Department, type Grant, type JobRole, type Me, type Member, type MemberChecklist, type MemberDoc, type ChecklistTemplate } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { GrantEditor } from "@/components/grant-editor";
import { Avatar, Badge, Button, Card, Empty, Field, PageHeader, Select } from "@/components/ui";
import { addMemberDocument, removeMemberDocument, saveGrants, startChecklist, tickTask, updateMember } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";
import type { Key } from "@/lib/i18n";


export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, tag } = await getI18n();
  const me = await api<Me>("/me");
  const can = (p: string) => me.permissions.includes(p);
  const [members, departments, roles] = await Promise.all([api<Member[]>("/members"), api<Department[]>("/departments"), api<JobRole[]>("/roles")]);
  const m = members.find((x) => x.id === id);
  if (!m) notFound();
  const dept = departments.find((d) => d.id === m.departmentId)?.name;
  const role = m.isOwner ? t("people.owner") : roles.find((r) => r.id === m.jobRoleId)?.name;
  const manager = members.find((x) => x.id === m.managerId);
  const reports = members.filter((x) => x.managerId === m.id && x.status === "ACTIVE");
  const self = m.id === me.id;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(tag, { dateStyle: "medium" }) : "—");
  const name = `${m.firstName} ${m.lastName}`;

  // What this viewer may see of a colleague: the basics for everyone, more for the person, their manager and admins.
  const canChecklists = self || manager?.id === me.id || can("checklist.manage");
  const canDocs = self || can("member.manage");
  const [lists, templates, docs, catalog] = await Promise.all([
    canChecklists ? api<MemberChecklist[]>(`/members/${id}/checklists`) : Promise.resolve([] as MemberChecklist[]),
    can("checklist.manage") ? api<ChecklistTemplate[]>("/checklist-templates") : Promise.resolve([] as ChecklistTemplate[]),
    canDocs ? api<MemberDoc[]>(`/members/${id}/documents`) : Promise.resolve([] as MemberDoc[]),
    can("permission.grant") ? api<{ action: string; label: string }[]>("/permissions/catalog") : Promise.resolve([]),
  ]);
  const grants = can("permission.grant")
    ? await api<Grant[]>(`/members/${id}/permissions`).catch((e) => { if (e instanceof ApiError) return []; throw e; })
    : [];
  // You can only hand out powers you hold yourself.
  const grantable = catalog.filter((p) => me.permissions.includes(p.action));

  return (
    <>
      <PageHeader title={name} sub={[role, dept].filter(Boolean).join(" · ") || m.workEmail} back={{ href: "/people", label: t("people.title") }}>
        <Badge tone={m.status === "ACTIVE" ? "good" : "warn"}>{t(`people.state.${m.status}` as Key)}</Badge>
        {self && <Badge tone="info">{t("profile.thisIsYou")}</Badge>}
      </PageHeader>

      <div className="mb-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t("profile.about")}>
          <div className="flex flex-wrap items-center gap-5">
            <Avatar name={name} size={72} member={m} />
            <dl className="grid flex-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">{t("profile.email")}</dt><dd className="font-medium"><a className="link" href={`mailto:${m.workEmail}`}>{m.workEmail}</a></dd></div>
              <div><dt className="text-xs text-muted">{t("people.jobRole")}</dt><dd className="font-medium">{role ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">{t("people.department")}</dt><dd className="font-medium">{dept ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">{t("profile.started")}</dt><dd className="font-medium">{fmt(m.startDate ?? null)}</dd></div>
              <div><dt className="text-xs text-muted">{t("profile.reportsTo")}</dt><dd className="font-medium">{manager ? <Link className="link" href={`/people/${manager.id}`}>{manager.firstName} {manager.lastName}</Link> : "—"}</dd></div>
            </dl>
          </div>
        </Card>
        <Card title={t("profile.reports", { n: reports.length })}>
          {reports.length === 0 ? <p className="text-sm text-muted">{t("profile.noReports", { name: m.firstName })}</p> : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id}><Link href={`/people/${r.id}`} className="flex items-center gap-3 rounded-ui p-1 text-sm hover:bg-surface-2"><Avatar name={`${r.firstName} ${r.lastName}`} size={28} member={r} /><span className="font-medium">{r.firstName} {r.lastName}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(canChecklists || canDocs) && (
        <div className="mb-6 grid items-start gap-6 xl:grid-cols-2">
          {canChecklists && (
            <Card title={t("profile.checklists")} sub={t("profile.checklistsSub")}>
              {lists.length === 0 && <Empty>{t("profile.noChecklists")}</Empty>}
              <div className="space-y-5">
                {lists.map((l) => {
                  const done = l.tasks.filter((t) => t.doneAt).length;
                  return (
                    <section key={l.id}>
                      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{l.name}</h3><span className="text-xs text-muted">{t("profile.doneOf", { done, total: l.tasks.length })}</span></div>
                      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-primary" style={{ width: `${l.tasks.length ? (done / l.tasks.length) * 100 : 0}%` }} /></div>
                      <ul className="rows text-sm">
                        {l.tasks.map((task) => (
                          <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className={task.doneAt ? "text-muted line-through" : "font-medium"}>{task.title}</p>
                              <p className="text-xs text-muted">{task.assignee ?? (task.who === "hr" ? t("profile.hr") : t("profile.notAssigned"))}{task.dueDate ? ` · ${t("profile.due", { date: fmt(task.dueDate) })}` : ""}</p>
                            </div>
                            {task.canTick && (
                              <form action={tickTask}><input type="hidden" name="id" value={task.id} /><input type="hidden" name="done" value={task.doneAt ? "0" : "1"} />
                                <Button type="submit" size="sm" variant={task.doneAt ? "subtle" : "ghost"}>{task.doneAt ? t("profile.undo") : t("profile.markDone")}</Button></form>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              {can("checklist.manage") && templates.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <ActionForm action={startChecklist} submit={t("profile.startBtn")} variant="ghost" className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="memberId" value={m.id} />
                    <div className="min-w-48 flex-1"><Select label={t("profile.startChecklist")} name="templateId" required>{templates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.kind})</option>)}</Select></div>
                  </ActionForm>
                </div>
              )}
              {can("checklist.manage") && templates.length === 0 && <p className="mt-4 text-sm text-muted">Create a checklist first in <Link className="link" href="/settings/checklists">Settings</Link>.</p>}
            </Card>
          )}

          {canDocs && (
            <Card title={t("profile.docs")} sub={self ? t("profile.docsSelf") : t("profile.docsOther")}>
              {docs.length === 0 && <Empty>{t("profile.noDocs")}</Empty>}
              <ul className="rows text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">{d.title} {!d.visibleToMember && <Badge tone="warn">{t("profile.hiddenFromThem")}</Badge>}</p>
                      <p className="text-xs capitalize text-muted">{d.kind} · {fmt(d.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a className="link text-[13px]" href={`/people/documents/${d.id}/file`} target="_blank" rel="noopener">{t("profile.open")}</a>
                      {can("member.manage") && <form action={removeMemberDocument}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="memberId" value={m.id} /><Button type="submit" size="sm" variant="danger">{t("profile.remove")}</Button></form>}
                    </div>
                  </li>
                ))}
              </ul>
              {can("member.manage") && (
                <div className="mt-5 border-t border-line pt-4">
                  <ActionForm action={addMemberDocument} submit={t("profile.upload")} block>
                    <input type="hidden" name="memberId" value={m.id} />
                    <Field label={t("profile.title")} name="title" required maxLength={120} placeholder="Employment contract" />
                    <Select label={t("profile.type")} name="kind" defaultValue="contract"><option value="contract">{t("profile.kind.contract")}</option><option value="id">{t("profile.kind.id")}</option><option value="certificate">{t("profile.kind.certificate")}</option><option value="other">{t("profile.kind.other")}</option></Select>
                    <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-medium">{t("profile.file")}</span>
                      <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required className="input py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" /></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visibleToMember" defaultChecked /> {t("profile.canSee", { name: m.firstName })}</label>
                  </ActionForm>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {can("member.manage") && (
          <Card title={t("profile.position")} sub={t("profile.positionSub")}>
            <ActionForm action={updateMember} submit={t("profile.saveChanges")}>
              <input type="hidden" name="id" value={m.id} />
              <Select label={t("people.department")} name="departmentId" defaultValue={m.departmentId ?? ""}>
                <option value="">{t("common.none")}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select label={t("people.jobRole")} name="jobRoleId" defaultValue={m.jobRoleId ?? ""}>
                <option value="">{t("common.none")}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Select label={t("profile.lineManager")} name="managerId" defaultValue={m.managerId ?? ""}>
                <option value="">{t("common.none")}</option>
                {members.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("profile.startDate")} name="startDate" type="date" defaultValue={m.startDate?.slice(0, 10) ?? ""} hint={t("profile.startDateHint")} />
                <Field label={t("profile.employeeNo")} name="employeeNo" defaultValue={m.employeeNo ?? ""} />
              </div>
              <Field label={t("profile.nic")} name="nationalId" placeholder={t("profile.nicPlaceholder")} autoComplete="off" hint={t("profile.nicHint")} />
              {!m.isOwner && (
                <Select label={t("profile.statusLabel")} name="status" defaultValue={m.status}>
                  <option value="ACTIVE">{t("people.state.ACTIVE")}</option>
                  <option value="SUSPENDED">{t("people.state.SUSPENDED")}</option>
                  <option value="LEFT">{t("profile.leftCompany")}</option>
                </Select>
              )}
            </ActionForm>
          </Card>
        )}
        {can("permission.grant") && !m.isOwner && m.id !== me.id && (
          <Card title={t("profile.adminAccess")} sub={t("profile.adminAccessSub")}>
            <ActionForm action={saveGrants} submit={t("profile.saveAccess")}>
              <input type="hidden" name="id" value={m.id} />
              <GrantEditor perms={grantable} departments={departments} initial={grants} />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
