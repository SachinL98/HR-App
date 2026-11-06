"use client";
import { ActionForm, type FormState } from "./action-form";
import { Field, Select } from "./ui";

export function MeetingForm({
  action, date, members, departments,
}: {
  action: (p: FormState, d: FormData) => Promise<FormState>; date: string;
  members: { id: string; name: string }[]; departments: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action} submit="Schedule meeting" block>
      <Field label="Title" name="title" required maxLength={120} />
      <Field label="Date" name="date" type="date" defaultValue={date} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" name="start" type="time" defaultValue="10:00" required />
        <Field label="To" name="end" type="time" defaultValue="10:30" required />
      </div>
      <Select label="Invite departments" name="departmentIds" multiple size={Math.min(4, Math.max(2, departments.length))} hint="Hold Ctrl or Cmd to pick several.">
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Select>
      <Select label="Invite people" name="memberIds" multiple size={Math.min(5, Math.max(2, members.length))} hint="Hold Ctrl or Cmd to pick several.">
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      <Field label="Location (optional)" name="location" maxLength={200} />
      <Field label="Video link (optional)" name="meetUrl" type="url" placeholder="https://meet.google.com/…" hint="Paste a Google Meet link." />
    </ActionForm>
  );
}
