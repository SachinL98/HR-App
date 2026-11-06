import type { ReactNode } from "react";
import { dictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "./i18n";

/** Reads the language cookie and makes it available to every page below. */
export async function I18nRoot({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return <I18nProvider locale={locale} dict={dictionary(locale)}>{children}</I18nProvider>;
}
