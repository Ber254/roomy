import { createHouse, joinHouse } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const button =
  "w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700";

const STEPS = [
  { n: "1", title: "Creá la casa", text: "Poné un nombre e invitá a tus roomies con un código de 6 letras. No hace falta registrarse." },
  { n: "2", title: "Anotá los gastos", text: "Cargá alquiler, expensas o compras y elegí entre quiénes se divide. Roomy calcula quién le debe a quién." },
  { n: "3", title: "Saldá con NEAR", text: "Pagás con la stablecoin que tengas, en la red que tengas. Tu roomie recibe USDC en NEAR, sin pasos intermedios." },
];

const FEATURES = [
  { icon: "⚖️", title: "Cuentas claras", text: "Balances por persona y la lista mínima de transferencias para quedar a mano." },
  { icon: "⚡", title: "Pagos con NEAR Intents", text: "Liquidá deudas entre cadenas: USDC o USDT en Base, Ethereum, Solana y más." },
  { icon: "🔐", title: "Garantías on-chain", text: "El depósito queda en un contrato en NEAR. Para devolverlo, las dos partes tienen que estar de acuerdo, y se pueden hacer devoluciones parciales." },
  { icon: "🗳️", title: "Fondo común y votaciones", text: "Cada casa tiene su DAO: los roomies votan decisiones y los pagos del fondo común." },
  { icon: "💬", title: "Chat de la casa", text: "Un lugar para avisos y coordinación, sin depender de un grupo de WhatsApp." },
  { icon: "🧹", title: "Tareas por turnos", text: "Las tareas rotan cada semana entre los roomies, y cada uno marca las suyas." },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
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
          </div>
        </aside>

        {/* Información: a la izquierda (2/3) en escritorio */}
        <section className="order-2 space-y-12 lg:order-1 lg:col-span-2">
          <header className="space-y-4">
            <p className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Construido para el NEAR Hackathon 2026
            </p>
            <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Compartir piso sin discutir por plata
            </h2>
            <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Hoy el alquiler, las expensas y las compras se arreglan por chat y con cuentas a mano: alguien siempre adelanta,
              alguien se olvida y la garantía queda en manos de una sola persona. Roomy ordena todo eso y lo liquida con
              NEAR.
            </p>
          </header>

          <div className="space-y-5">
            <h3 className="text-xl font-semibold">Cómo funciona</h3>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 font-bold text-white">
                    {s.n}
                  </span>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-5">
            <h3 className="text-xl font-semibold">Qué incluye</h3>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <span aria-hidden className="text-2xl">{f.icon}</span>
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-zinc-500">
            Versión de demostración. Los pagos usan NEAR Intents sobre mainnet; las garantías y las votaciones corren en testnet.
          </p>
        </section>
      </div>
    </main>
  );
}
