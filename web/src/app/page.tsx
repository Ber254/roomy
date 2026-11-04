import { createHouse, joinHouse } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const button =
  "w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Roomy</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Gastos, pagos y garantías del piso, en un solo lugar. Liquidá con NEAR.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={createHouse} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Crear una casa</h2>
        <input name="name" placeholder="Nombre de la casa" required maxLength={60} className={input} />
        <input name="displayName" placeholder="Tu nombre" required maxLength={40} className={input} />
        <button className={button}>Crear casa</button>
      </form>

      <form action={joinHouse} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Unirme con un código</h2>
        <input
          name="code"
          placeholder="Código de invitación"
          defaultValue={code}
          required
          maxLength={12}
          className={`${input} uppercase`}
        />
        <input name="displayName" placeholder="Tu nombre" required maxLength={40} className={input} />
        <button className={button}>Unirme</button>
      </form>
    </main>
  );
}
