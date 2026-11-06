"use client";
import { useActionState, useContext, useEffect, type ReactNode } from "react";
import { toast, ToastContext } from "./toaster";
import { Button } from "./ui";
import { useI18n } from "./i18n";

export interface FormState { error?: string; ok?: string; devLink?: string }
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

/** A form wired to a server action, showing its error or success message. `block` makes the button full width. */
export function ActionForm({
  action, children, submit, variant, className, block,
}: {
  action: Action; children?: ReactNode; submit: string;
  variant?: "primary" | "ghost" | "danger"; className?: string; block?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  // Inside the signed-in app a success shows as a toast; elsewhere (sign-in pages) it stays in the form.
  const inApp = useContext(ToastContext);
  const { t } = useI18n();
  useEffect(() => {
    if (state.ok && inApp) toast(state.ok);
  }, [state, inApp]);
  return (
    <form action={run} className={className ?? "space-y-4"}>
      {children}
      {state.error && (
        <p role="alert" className="rounded-ui border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{state.error}</p>
      )}
      {state.ok && !inApp && (
        <p role="status" className="rounded-ui border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{state.ok}</p>
      )}
      {state.devLink && (
        <p className="break-all text-xs text-muted">Dev only invite link: <a className="link" href={state.devLink}>{state.devLink}</a></p>
      )}
      <Button type="submit" variant={variant} disabled={pending} className={block ? "w-full" : undefined}>{pending ? t("common.working") : submit}</Button>
    </form>
  );
}
