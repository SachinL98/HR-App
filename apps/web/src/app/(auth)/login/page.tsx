import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui";
import { login } from "../../actions";

export const metadata = { title: "Sign in · HR App" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
      <p className="mb-5 text-sm text-muted">Sign in to your company workspace.</p>
      <ActionForm action={login} submit="Sign in">
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Field label="Organization slug" name="tenantSlug" hint="Only needed if you belong to more than one company." />
      </ActionForm>
      <p className="mt-5 text-center text-sm text-muted">
        New company? <Link className="font-medium text-primary underline" href="/register">Create an account</Link>
      </p>
    </>
  );
}
