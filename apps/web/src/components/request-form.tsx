"use client";
import { useState } from "react";
import { ActionForm, type FormState } from "./action-form";
import { Field, Select } from "./ui";
import { useI18n } from "./i18n";

export function RequestForm({
  action, leaveTypes,
}: { action: (p: FormState, d: FormData) => Promise<FormState>; leaveTypes: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [type, setType] = useState<"LEAVE" | "WFH">("LEAVE");
  return (
    <ActionForm action={action} submit={t("leave.send")} block>
      <Select label={t("leave.requestType")} name="type" value={type} onChange={(e) => setType(e.target.value as "LEAVE" | "WFH")}>
        <option value="LEAVE">{t("leave.leaveWord")}</option>
        <option value="WFH">{t("leave.wfh")}</option>
      </Select>
      {type === "LEAVE" && (
        <Select label={t("leave.leaveType")} name="leaveTypeId" required>
          {leaveTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("leave.from")} name="startDate" type="date" required />
        <Field label={t("leave.to")} name="endDate" type="date" hint={t("leave.toHint")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label={t("leave.firstDay")} name="startPart" defaultValue="FULL">
          <option value="FULL">{t("leave.fullDay")}</option>
          <option value="PM">{t("leave.afternoon")}</option>
        </Select>
        <Select label={t("leave.lastDay")} name="endPart" defaultValue="FULL">
          <option value="FULL">{t("leave.fullDay")}</option>
          <option value="AM">{t("leave.morning")}</option>
        </Select>
      </div>
      <Field label={t("leave.reason")} name="reason" maxLength={500} />
    </ActionForm>
  );
}
