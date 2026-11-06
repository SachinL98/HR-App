import { api, type AccountOverview, type Me, type SessionItem } from "@/lib/api";
import { ActionForm } from "@/components/action-form";
import { MfaSetup } from "@/components/mfa-setup";
import { Badge, Button, Card, Field, PageHeader } from "@/components/ui";
import { changePassword, mfaDisable, revokeOtherSessions, revokeSession } from "../../actions";
import { LanguageSwitch } from "@/components/language-switch";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "My account · Seamless Source HR" };

/** "Chrome on Mac" style summary from a browser's user-agent text. */
function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function Account() {
  const { t } = await getI18n();
  const [me, acct, sessions] = await Promise.all([api<Me>("/me"), api<AccountOverview>("/account"), api<SessionItem[]>("/account/sessions")]);
  return (
    <>
      <PageHeader title={t("account.title")} sub={`${me.firstName} ${me.lastName} · ${acct.email}`}>
        <Badge tone={acct.emailVerified ? "good" : "warn"}>{acct.emailVerified ? "Email confirmed" : "Email not confirmed"}</Badge>
      </PageHeader>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card title={t("account.languageTitle")} sub={t("account.languageSub")} className="xl:col-span-2"><LanguageSwitch /></Card>
        <Card title="Change password" sub="You stay signed in here. Other devices are signed out.">
          <ActionForm action={changePassword} submit="Change password" block>
            <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
            <Field label="New password" name="next" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. Avoid common words." />
            <Field label="Type the new password again" name="again" type="password" autoComplete="new-password" minLength={10} required />
          </ActionForm>
        </Card>

        <Card title="Two-factor sign-in" sub={acct.mfaEnabled ? `On. ${acct.recoveryCodesLeft} recovery codes left.` : "Off. Strongly recommended for admins."}>
          {acct.mfaEnabled ? (
            <ActionForm action={mfaDisable} submit="Turn off" variant="danger" block>
              <p className="text-sm text-muted">To turn it off, confirm your password and a code from your app (or a recovery code).</p>
              <Field label="Password" name="password" type="password" autoComplete="current-password" required />
              <Field label="Code" name="code" autoComplete="one-time-code" required maxLength={12} />
            </ActionForm>
          ) : <MfaSetup />}
        </Card>

        <Card flush title="Where you are signed in" sub="End any you do not recognise." className="xl:col-span-2"
          action={sessions.length > 1 ? <form action={revokeOtherSessions}><Button variant="ghost" size="sm" type="submit">Sign out everywhere else</Button></form> : undefined}>
          <ul className="rows">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">{device(s.userAgent)} {s.current && <Badge tone="good">This device</Badge>}</p>
                  <p className="text-xs text-muted">{s.ip ? `${s.ip} · ` : ""}Signed in {new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                {!s.current && <form action={revokeSession}><input type="hidden" name="id" value={s.id} /><Button variant="ghost" size="sm" type="submit">Sign out</Button></form>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
