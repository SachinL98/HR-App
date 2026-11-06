import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { forgotPassword } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Forgot password · Seamless Source HR" };

export default async function Forgot() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.resetText")}</p>
      <ActionForm action={forgotPassword} submit={t("auth.sendReset")} block>
        <Field label={t("auth.workEmail")} name="email" type="email" autoComplete="email" required />
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted"><Link className="link" href="/login">{t("auth.backToSignIn")}</Link></p>
    </>
  );
}
