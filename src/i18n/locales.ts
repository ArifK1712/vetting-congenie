import type { Locale } from "./routing";

/**
 * Per-locale presentation settings. Adding a language means adding an entry
 * here, a messages/<locale>.json file and the locale code in routing.ts.
 *
 * `intl` is the BCP 47 tag used for all date/number formatting. Arabic is
 * pinned to the Gregorian calendar and Latin digits: browsers default ar-SA
 * to the Hijri calendar and Arabic-Indic digits.
 */
export const localeConfig: Record<
  Locale,
  { dir: "ltr" | "rtl"; intl: string; nativeName: string; shortName: string }
> = {
  en: { dir: "ltr", intl: "en-GB", nativeName: "English", shortName: "EN" },
  ar: { dir: "rtl", intl: "ar-u-ca-gregory-nu-latn", nativeName: "العربية", shortName: "عربي" },
};
