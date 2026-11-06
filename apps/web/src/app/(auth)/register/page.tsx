import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/ui";
import { register } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Create your company · Seamless Source HR" };

export default async function RegisterPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.createCompany")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("auth.createCompanyText")}</p>
      <ActionForm action={register} submit={t("auth.createAccount")} block>
        <Field label={t("auth.companyName")} name="orgName" required minLength={2} />
        <Select label={t("auth.country")} name="country" defaultValue="GB">
          <option value="GB">United Kingdom</option>
          <option value="LK">Sri Lanka</option>
          <option value="US">United States</option>
          <option value="IN">India</option>
          <option value="AU">Australia</option>
          <option value="AE">United Arab Emirates</option>
          <option value="SG">Singapore</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.firstName")} name="firstName" autoComplete="given-name" required />
          <Field label={t("auth.lastName")} name="lastName" autoComplete="family-name" required />
        </div>
        <Field label={t("auth.workEmail")} name="email" type="email" autoComplete="email" required />
        <Field label={t("auth.password")} name="password" type="password" autoComplete="new-password" minLength={10} required hint={t("auth.passwordHint")} />
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.haveAccount")} <Link className="link" href="/login">{t("auth.signIn")}</Link>
      </p>
    </>
  );
}
