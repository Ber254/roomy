import { es, type Dict, type Key } from "./es";
import { en } from "./en";

export type { Dict, Key };
export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];
export const LOCALE_COOKIE = "roomy_locale";
export const DICTS: Record<Locale, Dict> = { es, en };

export type Params = Record<string, string | number>;
export type TFn = (key: Key, params?: Params) => string;

/** Reemplaza {nombre} por su valor; si falta el parámetro deja el marcador visible (para detectar errores). */
export function translate(dict: Dict, key: Key, params?: Params): string {
  const s = dict[key];
  return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`)) : s;
}

export const makeT = (locale: Locale): TFn => (key, params) => translate(DICTS[locale], key, params);

export const isLocale = (v: unknown): v is Locale => v === "es" || v === "en";

/**
 * Orden: cookie elegida por la persona > Accept-Language del navegador (es* -> es, otro idioma -> en) > español.
 * Sin cookie ni cabecera (clientes que no son navegadores) se usa español.
 */
export function detectLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase();
  if (!first) return "es";
  return first.startsWith("es") ? "es" : "en";
}

/** Locale BCP-47 para Intl (moneda, fechas). */
export const intlLocale = (l: Locale) => (l === "en" ? "en-US" : "es-AR");
