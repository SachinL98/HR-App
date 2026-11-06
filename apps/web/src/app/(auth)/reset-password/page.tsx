import { Suspense } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { resetPassword } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Choose a new password · Seamless Source HR" };

async function Form({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  const { token } = await searchParams;
  if (!token) return <p className="rounded-ui border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">This link is incomplete. <Link className="link" href="/forgot-password">Ask for a new one.</Link></p>;
  return (
    <ActionForm action={resetPassword} submit={t("auth.changePassword")} block>
      <input type="hidden" name="token" value={token} />
      <Field label={t("auth.newPassword")} name="password" type="password" autoComplete="new-password" minLength={10} required hint={t("auth.newPasswordHint")} />
      <Field label={t("auth.again")} name="again" type="password" autoComplete="new-password" minLength={10} required />
    </ActionForm>
  );
}

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.chooseNew")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.signedOutElsewhere")}</p>
      <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}><Form searchParams={searchParams} /></Suspense>
    </>
  );
}
