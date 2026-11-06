import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { loginMfa } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Two-factor sign-in · Seamless Source HR" };

export default async function Verify() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.enterCode")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.codeText")}</p>
      <ActionForm action={loginMfa} submit={t("auth.verifySignIn")} block>
        <Field label={t("auth.code")} name="code" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={12}
          hint={t("auth.codeHint")} />
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted"><Link className="link" href="/login">{t("auth.backToSignIn")}</Link></p>
    </>
  );
}
