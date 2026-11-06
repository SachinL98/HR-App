import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionary, isLocale, LOCALES, type Key, type Locale } from './dictionaries';

export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;
/** Same as T, but picks the ".one" or ".other" wording for a count. */
export type TN = (key: string, n: number, vars?: Vars) => string;

const KEY = 'hr_lang';
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** The device's own language, if we offer it. */
function deviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (tag.startsWith('si')) return 'si';
    if (tag.startsWith('ta')) return 'ta';
  } catch { /* no Intl: English */ }
  return 'en';
}

interface Ctx { locale: Locale; tag: string; t: T; tn: TN; setLocale: (l: Locale) => Promise<void> }
const I18n = createContext<Ctx | null>(null);

/** Holds the chosen language. It is remembered on the phone; the account's saved choice is applied after sign-in. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>(deviceLocale);
  useEffect(() => {
    void SecureStore.getItemAsync(KEY).then((v) => { if (isLocale(v)) set(v); }).catch(() => undefined);
  }, []);
  const setLocale = useCallback(async (l: Locale) => {
    set(l);
    await SecureStore.setItemAsync(KEY, l).catch(() => undefined);
  }, []);
  const value = useMemo<Ctx>(() => {
    const dict = dictionary(locale);
    const t: T = (key, vars) => fill(dict[key] ?? key, vars);
    const tn: TN = (key, n, vars) => fill(dict[`${key}.${n === 1 ? 'one' : 'other'}` as Key] ?? dict[key as Key] ?? key, { n, ...vars });
    return { locale, tag: LOCALES.find((x) => x.id === locale)?.tag ?? 'en-GB', t, tn, setLocale };
  }, [locale, setLocale]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const v = useContext(I18n);
  if (!v) throw new Error('useI18n must be used inside LocaleProvider');
  return v;
}
export { LOCALES, isLocale, type Key, type Locale };
