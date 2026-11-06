"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguage } from "@/app/actions";
import { LOCALES, isLocale } from "@/lib/i18n";
import { useI18n } from "./i18n";

/** A small language picker. The choice is remembered on this device and, once signed in, on the person's account. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={t("common.language")} value={locale} disabled={pending}
      onChange={(e) => { const v = e.target.value; if (isLocale(v)) start(async () => { await setLanguage(v); router.refresh(); }); }}
      className={`input w-auto min-h-10 py-1.5 pr-8 text-sm ${className}`}
    >
      {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
    </select>
  );
}
