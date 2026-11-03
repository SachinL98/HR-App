"use client";
import { useActionState } from "react";
import type { FormState } from "./action-form";
import { Button } from "./ui";

export function DecideForm({ id, action }: { id: string; action: (p: FormState, d: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input name="comment" placeholder="Comment (needed to reject or ask for changes)" aria-label="Comment"
        className="w-full rounded-ui border border-line bg-surface px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending}>Approve</Button>
        <Button type="submit" name="decision" value="CHANGES_REQUESTED" variant="ghost" disabled={pending}>Ask for changes</Button>
        <Button type="submit" name="decision" value="REJECTED" variant="danger" disabled={pending}>Reject</Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
