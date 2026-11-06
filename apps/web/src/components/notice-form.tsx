"use client";
import { useState } from "react";
import { ActionForm, type FormState } from "./action-form";
import { Field, Select, Textarea } from "./ui";

export function NoticeForm({
  action, departments,
}: { action: (p: FormState, d: FormData) => Promise<FormState>; departments: { id: string; name: string }[] }) {
  const [audience, setAudience] = useState("all");
  return (
    <ActionForm action={action} submit="Publish" block>
      <Field label="Title" name="title" required maxLength={140} />
      <Textarea label="Message" name="body" required maxLength={10000} rows={6} />
      <Select label="Who should see it" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
        <option value="all">Everyone</option>
        <option value="departments">Chosen departments</option>
      </Select>
      {audience === "departments" && (
        <Select label="Departments" name="departmentIds" multiple size={Math.min(5, Math.max(2, departments.length))} hint="Hold Ctrl or Cmd to pick several.">
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="important" /> Mark as important</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireAck" /> Ask people to confirm they have read it</label>
    </ActionForm>
  );
}
