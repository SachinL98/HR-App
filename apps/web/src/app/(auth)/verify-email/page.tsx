import { Suspense } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { verifyEmail } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Confirm your email · Seamless Source HR" };

// A button, not an automatic check: mail scanners open links, and that must not use up the link.
async function Confirm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  const { token } = await searchParams;
  if (!token) return <p className="text-sm">This link is incomplete. Use the link in your email, or sign in to ask for a new one.</p>;
  return (
    <ActionForm action={verifyEmail} submit={t("auth.confirmMyEmail")} block>
      <input type="hidden" name="token" value={token} />
    </ActionForm>
  );
}

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.confirmEmail")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.confirmEmailText")}</p>
      <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}><Confirm searchParams={searchParams} /></Suspense>
      <p className="mt-6 text-center text-sm text-muted"><Link className="link" href="/login">{t("auth.backToSignIn")}</Link></p>
    </>
  );
}
