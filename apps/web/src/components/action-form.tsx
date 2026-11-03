"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "./ui";

export interface FormState { error?: string; ok?: string; devLink?: string }
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

/** A form wired to a server action, showing its error or success message. */
export function ActionForm({
  action, children, submit, variant, className,
}: {
  action: Action; children?: ReactNode; submit: string;
  variant?: "primary" | "ghost" | "danger"; className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className={className ?? "space-y-4"}>
      {children}
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-600">{state.ok}</p>}
      {state.devLink && (
        <p className="break-all text-xs text-muted">Dev only invite link: <a className="underline" href={state.devLink}>{state.devLink}</a></p>
      )}
      <Button type="submit" variant={variant} disabled={pending}>{pending ? "Working…" : submit}</Button>
    </form>
  );
}
