import "server-only";
import { cookies } from "next/headers";
import { dateTag, dictionary, isLocale, LANG_COOKIE, makeT, type Locale } from "./index";

/** The language chosen for this browser (English until a choice is made). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}

/** For server pages: `const { t, tn, locale, tag } = await getI18n();` */
export async function getI18n() {
  const locale = await getLocale();
  return { ...makeT(dictionary(locale)), locale, tag: dateTag(locale) };
}
