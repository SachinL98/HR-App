"use client";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { dateTag, makeT, type Key, type Locale, type T, type TN } from "@/lib/i18n";

interface Ctx { locale: Locale; tag: string; t: T; tn: TN }
const I18nContext = createContext<Ctx>({ locale: "en", tag: "en-GB", ...makeT({} as Record<Key, string>) });

/** Gives client components the chosen language. The server passes in the full dictionary. */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Record<Key, string>; children: ReactNode }) {
  const value = useMemo(() => ({ locale, tag: dateTag(locale), ...makeT(dict) }), [locale, dict]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
