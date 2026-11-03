import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { acceptInvite } from "../../actions";

export const metadata = { title: "Join your company · HR App" };

async function InviteForm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <p className="text-sm">This invite link is missing its token. Ask your admin to send it again.</p>;
  return (
    <ActionForm action={acceptInvite} submit="Accept invite">
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="firstName" required />
        <Field label="Last name" name="lastName" required />
      </div>
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. If you already have an account, enter your existing password." />
    </ActionForm>
  );
}

export default function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Join your company</h1>
      <p className="mb-5 text-sm text-muted">Set up your account to accept the invite.</p>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <InviteForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}
