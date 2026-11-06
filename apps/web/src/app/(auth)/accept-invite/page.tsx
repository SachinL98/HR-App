import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { acceptInvite } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Join your company · Seamless Source HR" };

async function InviteForm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  const { token } = await searchParams;
  if (!token) return <p className="rounded-ui border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">This invite link is incomplete. Ask your admin to send it again.</p>;
  return (
    <ActionForm action={acceptInvite} submit={t("auth.acceptInvite")} block>
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("auth.firstName")} name="firstName" required />
        <Field label={t("auth.lastName")} name="lastName" required />
      </div>
      <Field label={t("auth.password")} name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. Already have an account? Enter your current password." />
    </ActionForm>
  );
}

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.joinCompany")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.joinText")}</p>
      <Suspense fallback={<p className="text-sm text-muted">{t("common.loading")}</p>}>
        <InviteForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}
