"use client";
import { useState } from "react";
import { ActionForm, type FormState } from "./action-form";
import { Field, Select } from "./ui";

export function RequestForm({
  action, leaveTypes,
}: { action: (p: FormState, d: FormData) => Promise<FormState>; leaveTypes: { id: string; name: string }[] }) {
  const [type, setType] = useState<"LEAVE" | "WFH">("LEAVE");
  return (
    <ActionForm action={action} submit="Send for approval">
      <Select label="Request" name="type" value={type} onChange={(e) => setType(e.target.value as "LEAVE" | "WFH")}>
        <option value="LEAVE">Leave</option>
        <option value="WFH">Work from home</option>
      </Select>
      {type === "LEAVE" && (
        <Select label="Leave type" name="leaveTypeId" required>
          {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" name="startDate" type="date" required />
        <Field label="To" name="endDate" type="date" hint="Leave empty for one day." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="First day" name="startPart" defaultValue="FULL">
          <option value="FULL">Full day</option>
          <option value="PM">Afternoon only</option>
        </Select>
        <Select label="Last day" name="endPart" defaultValue="FULL">
          <option value="FULL">Full day</option>
          <option value="AM">Morning only</option>
        </Select>
      </div>
      <Field label="Reason (optional)" name="reason" maxLength={500} />
    </ActionForm>
  );
}
