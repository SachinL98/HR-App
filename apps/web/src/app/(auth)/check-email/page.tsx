import { Suspense } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { resendVerification } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Check your email · Seamless Source HR" };

async function Body({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { t } = await getI18n();
  const { email = "" } = await searchParams;
  return (
    <>
      <p className="mb-6 text-sm text-muted">{t("auth.checkEmailText", { email: email || "…" })}</p>
      <ActionForm action={resendVerification} submit={t("auth.sendAgain")} variant="ghost" block>
        <input type="hidden" name="email" value={email} />
      </ActionForm>
    </>
  );
}

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("auth.checkEmail")}</h1>
      <Suspense fallback={null}><Body searchParams={searchParams} /></Suspense>
      <p className="mt-6 text-center text-sm text-muted"><Link className="link" href="/login">{t("auth.backToSignIn")}</Link></p>
    </>
  );
}
