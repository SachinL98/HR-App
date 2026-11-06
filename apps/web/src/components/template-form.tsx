"use client";
import { useState } from "react";
import { ActionForm, type FormState } from "./action-form";
import { LetterheadFields } from "./letterhead-fields";
import { Field, Select, Textarea } from "./ui";
import { STARTERS } from "@/lib/starters";
import { useI18n } from "./i18n";

const KINDS = [
  ["confirmation", "Employment confirmation"], ["experience", "Experience letter"], ["offer", "Offer"],
  ["contract", "Contract"], ["salary_cert", "Salary certificate"], ["payslip", "Payslip letterhead"], ["custom", "Other"],
] as const;

/** New template form. Picking a ready-made letter fills in the name, type and wording, all still editable. */
export function TemplateForm({ action, fields }: { action: (p: FormState, d: FormData) => Promise<FormState>; fields: { name: string }[] }) {
  const { t: tr } = useI18n();
  const [t, setT] = useState({ name: STARTERS[0].name, kind: STARTERS[0].kind, body: STARTERS[0].body, requestable: STARTERS[0].requestable });
  const [key, setKey] = useState(0); // remounts the inputs so their defaults reset when a starter is picked
  return (
    <ActionForm action={action} submit={tr("md.form.save")} block>
      <Select label={tr("md.form.startFrom")} value="" onChange={(e) => {
        const s = STARTERS.find((x) => x.id === e.target.value);
        if (s) { setT({ name: s.name, kind: s.kind, body: s.body, requestable: s.requestable }); setKey((k) => k + 1); }
      }} hint={tr("md.form.startHint")}>
        <option value="">{tr("md.form.chooseReady")}</option>
        {STARTERS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <div key={key} className="space-y-4">
        <Field label={tr("md.edit.name")} name="name" required maxLength={80} defaultValue={t.name} />
        <Select label={tr("md.form.type")} name="kind" defaultValue={t.kind}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Textarea label={tr("md.edit.body")} name="body" rows={16} required defaultValue={t.body} className="font-mono text-xs" />
        <LetterheadFields />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requestable" defaultChecked={t.requestable} /> {tr("md.form.employeesRequest")}</label>
      </div>
      <p className="text-xs text-muted">{tr("md.form.fieldsLabel")} {fields.map((f) => `{{${f.name}}}`).join(" ")} {"{{stamp}} {{signature.name}}"}</p>
    </ActionForm>
  );
}
