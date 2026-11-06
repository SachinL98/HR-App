import { Suspense } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { login } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Sign in · Seamless Source HR" };

async function Notice({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string }> }) {
  const { t } = await getI18n();
  const sp = await searchParams;
  const msg = sp.reset ? t("auth.passwordChanged") : sp.verified ? t("auth.emailConfirmed") : null;
  return msg ? <p role="status" className="mb-4 rounded-ui border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{msg}</p> : null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string }> }) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.welcomeBack")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.signInTo")}</p>
      <Suspense fallback={null}><Notice searchParams={searchParams} /></Suspense>
      <ActionForm action={login} submit={t("auth.signIn")} block>
        <Field label={t("auth.workEmail")} name="email" type="email" autoComplete="email" required />
        <div>
          <Field label={t("auth.password")} name="password" type="password" autoComplete="current-password" required />
          <p className="mt-1.5 text-right text-xs"><Link className="link" href="/forgot-password">{t("auth.forgot")}</Link></p>
        </div>
        <Field label={t("auth.companyId")} name="tenantSlug" hint={t("auth.companyIdHint")} />
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.newCompany")} <Link className="link" href="/register">{t("auth.createAccount")}</Link>
      </p>
    </>
  );
}
