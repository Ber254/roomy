"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { intlLocale, translate, type Dict, type Locale, type TFn } from "./index";

type Ctx = { locale: Locale; intl: string; t: TFn };
const I18nCtx = createContext<Ctx | null>(null);

/** El servidor pasa el diccionario ya elegido: los componentes cliente no importan los dos idiomas. */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({ locale, intl: intlLocale(locale), t: (key, params) => translate(dict, key, params) }),
    [locale, dict],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n requiere <I18nProvider>");
  return c;
}
export const useT = () => useI18n().t;
