import { cookies, headers } from "next/headers";
import { detectLocale, intlLocale, LOCALE_COOKIE, makeT, type Locale, type TFn } from "./index";

export async function getLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return detectLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
}

export async function getT(): Promise<TFn & { locale: Locale; intl: string }> {
  const locale = await getLocale();
  const t = makeT(locale) as TFn & { locale: Locale; intl: string };
  t.locale = locale;
  t.intl = intlLocale(locale);
  return t;
}
