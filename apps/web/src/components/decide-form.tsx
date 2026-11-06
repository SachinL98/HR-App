"use client";
import { useActionState } from "react";
import type { FormState } from "./action-form";
import { Button } from "./ui";
import { useI18n } from "./i18n";

export function DecideForm({ id, action }: { id: string; action: (p: FormState, d: FormData) => Promise<FormState> }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input name="comment" placeholder={t("approvals.comment")} aria-label="Comment" className="input" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending}>{t("approvals.approve")}</Button>
        <Button type="submit" name="decision" value="CHANGES_REQUESTED" variant="ghost" disabled={pending}>{t("approvals.changes")}</Button>
        <Button type="submit" name="decision" value="REJECTED" variant="danger" disabled={pending}>{t("approvals.reject")}</Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
