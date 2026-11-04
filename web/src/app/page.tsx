import { createHouse, joinHouse } from "./actions";
import { getT } from "@/i18n/server";
import type { Key } from "@/i18n";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const button =
  "w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700";

const STEPS = ["1", "2", "3"] as const;
const FEATURES = [
  { icon: "⚖️", id: "f1" },
  { icon: "⚡", id: "f2" },
  { icon: "🔐", id: "f3" },
  { icon: "🗳️", id: "f4" },
  { icon: "💬", id: "f5" },
  { icon: "🧹", id: "f6" },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const t = await getT();
  const { error, code } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
        {/* Formularios: primero en móvil, a la derecha (1/3) en escritorio */}
        <aside className="order-1 lg:order-2 lg:col-span-1">
          <div className="space-y-8 rounded-2xl border border-zinc-200 p-5 shadow-sm dark:border-zinc-800 lg:sticky lg:top-8">
            <h1 className="text-3xl font-bold tracking-tight">Roomy</h1>

            {error && (
              <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <form action={createHouse} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("landing.createTitle")}</h2>
              <input name="name" placeholder={t("landing.houseName")} required maxLength={60} className={input} />
              <input name="displayName" placeholder={t("landing.yourName")} required maxLength={40} className={input} />
              <button className={button}>{t("landing.createBtn")}</button>
            </form>

            <form action={joinHouse} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("landing.joinTitle")}</h2>
              <input
                name="code"
                placeholder={t("landing.code")}
                defaultValue={code}
                required
                maxLength={12}
                className={`${input} uppercase`}
              />
              <input name="displayName" placeholder={t("landing.yourName")} required maxLength={40} className={input} />
              <button className={button}>{t("landing.joinBtn")}</button>
            </form>
          </div>
        </aside>

        {/* Información: a la izquierda (2/3) en escritorio */}
        <section className="order-2 space-y-12 lg:order-1 lg:col-span-2">
          <header className="space-y-4">
            <p className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {t("landing.badge")}
            </p>
            <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{t("landing.title")}</h2>
            <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">{t("landing.lead")}</p>
          </header>

          <div className="space-y-5">
            <h3 className="text-xl font-semibold">{t("landing.how")}</h3>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((n) => (
                <li key={n} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 font-bold text-white">
                    {n}
                  </span>
                  <p className="font-semibold">{t(`landing.step${n}.title` as Key)}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(`landing.step${n}.text` as Key)}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-5">
            <h3 className="text-xl font-semibold">{t("landing.includes")}</h3>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.id} className="flex gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span aria-hidden className="text-2xl">{f.icon}</span>
                  <div>
                    <p className="font-semibold">{t(`landing.${f.id}.title` as Key)}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(`landing.${f.id}.text` as Key)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-zinc-500">{t("landing.demoNote")}</p>
        </section>
      </div>
    </main>
  );
}
