import { en, type Key } from "./en";
import { si } from "./si";
import { ta } from "./ta";

export type Locale = "en" | "si" | "ta";
export const LOCALES: { id: Locale; label: string; tag: string }[] = [
  { id: "en", label: "English", tag: "en-GB" },
  { id: "si", label: "සිංහල", tag: "si-LK" },
  { id: "ta", label: "தமிழ்", tag: "ta-LK" },
];
export const LANG_COOKIE = "hr_lang";
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "si" || v === "ta";

const PARTIAL: Record<Locale, Partial<Record<Key, string>>> = { en, si, ta };

/** The whole dictionary for a language, with English filling any gap. */
export const dictionary = (l: Locale): Record<Key, string> => ({ ...en, ...PARTIAL[l] });

export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;
/** Same as T, but picks the ".one" or ".other" wording for a count. */
export type TN = (key: string, n: number, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

export function makeT(dict: Record<Key, string>): { t: T; tn: TN } {
  const t: T = (key, vars) => fill(dict[key] ?? key, vars);
  const tn: TN = (key, n, vars) => {
    const k = `${key}.${n === 1 ? "one" : "other"}` as Key;
    return fill(dict[k] ?? dict[key as Key] ?? key, { n, ...vars });
  };
  return { t, tn };
}

/** The BCP 47 tag for formatting dates and numbers (for example "si-LK"). */
export const dateTag = (l: Locale) => LOCALES.find((x) => x.id === l)?.tag ?? "en-GB";
export type { Key };
