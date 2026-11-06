import Link from "next/link";
import type { PlanInfo } from "@/lib/api";
import type { T } from "@/lib/i18n";

const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" });

/** Tells whoever manages billing what is about to change, early enough to act on it. Shows nothing when all is well. */
export function PlanBanner({ plan, trialDaysLeft, t }: { plan: PlanInfo; trialDaysLeft: number | null; t: T }) {
  let tone: "info" | "warn" | "bad" | null = null;
  let text = "";
  if (plan.state === "trial" && trialDaysLeft !== null && trialDaysLeft <= 3) {
    tone = "info";
    text = trialDaysLeft === 1 ? t("plan.trialEndsOne") : t("plan.trialEnds", { n: trialDaysLeft });
  } else if (plan.state === "trial_grace" && plan.graceEndsAt) {
    tone = "warn";
    text = `Your free trial has ended. Everything keeps working until ${day(plan.graceEndsAt)}, then the company moves to the Free plan.`;
  } else if (plan.state === "trial_ended" || plan.state === "canceled") {
    tone = "bad";
    text = `You are on the Free plan (up to ${plan.seatLimit} people). Payroll and other paid features are read-only. Nothing has been deleted.`;
  } else if (plan.state === "past_due" && plan.graceEndsAt) {
    tone = "warn";
    text = `Your last payment did not go through. Please fix it by ${day(plan.graceEndsAt)} to keep your plan.`;
  } else if (plan.seatsUsed > plan.seatLimit) {
    tone = "warn";
    text = `You have ${plan.seatsUsed} people but your plan covers ${plan.seatLimit}. Existing people keep working; you cannot invite more.`;
  }
  if (!tone) return null;
  const cls = { info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200", warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200", bad: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" }[tone];
  return (
    <p role="status" className={`mb-6 rounded-ui border px-4 py-3 text-sm ${cls}`}>
      {text} <Link href="/settings/billing" className="font-semibold underline">{t("plan.seeBilling")}</Link>
    </p>
  );
}
