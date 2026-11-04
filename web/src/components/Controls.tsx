"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { setLocale } from "@/app/actions";
import { LOCALES, type Locale } from "@/i18n";
import { useI18n } from "@/i18n/client";

const pill =
  "inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm transition hover:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

/** Barra superior global: idioma (ES/EN) y tema (claro pastel / oscuro). */
export default function Controls() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => setMounted(true), []);

  const choose = (l: Locale) =>
    start(async () => {
      if (l === locale) return;
      await setLocale(l);
      router.refresh();
    });

  const dark = mounted && resolvedTheme === "dark";
  return (
    <div className="mx-auto flex max-w-6xl justify-end gap-2 px-4 pt-4 sm:px-6">
      <div role="group" aria-label={t("ctl.language")} className="inline-flex overflow-hidden rounded-full border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => choose(l)}
            aria-pressed={l === locale}
            disabled={pending}
            className={`h-9 px-3 text-sm font-semibold uppercase transition ${
              l === locale ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={pill}
        aria-label={dark ? t("ctl.toLight") : t("ctl.toDark")}
        title={dark ? t("ctl.toLight") : t("ctl.toDark")}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        <span aria-hidden>{mounted ? (dark ? "☀️" : "🌙") : "·"}</span>
      </button>
    </div>
  );
}
