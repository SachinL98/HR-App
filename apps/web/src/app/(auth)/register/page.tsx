import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Select } from "@/components/ui";
import { register } from "../../actions";

export const metadata = { title: "Create your company · HR App" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your company account</h1>
      <p className="mb-5 text-sm text-muted">You become the owner. Start with a 14-day Gold trial.</p>
      <ActionForm action={register} submit="Create account">
        <Field label="Company name" name="orgName" required minLength={2} />
        <Select label="Country" name="country" defaultValue="GB">
          <option value="GB">United Kingdom</option>
          <option value="LK">Sri Lanka</option>
          <option value="US">United States</option>
          <option value="IN">India</option>
          <option value="AU">Australia</option>
          <option value="AE">United Arab Emirates</option>
          <option value="SG">Singapore</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="firstName" autoComplete="given-name" required />
          <Field label="Last name" name="lastName" autoComplete="family-name" required />
        </div>
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
      </ActionForm>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account? <Link className="font-medium text-primary underline" href="/login">Sign in</Link>
      </p>
    </>
  );
}
