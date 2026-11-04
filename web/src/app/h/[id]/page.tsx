import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, houses, members, expenses, expenseSplits, payments } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { netBalances, simplifyDebts } from "@/lib/balances";
import { formatCents } from "@/lib/money";
import { addExpense } from "@/app/actions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default async function HousePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!UUID.test(id)) notFound();

  const [house] = await db.select().from(houses).where(eq(houses.id, id));
  if (!house) notFound();

  const me = await getCurrentMember(id);
  if (!me) redirect("/"); // sin cookie de miembro: debe unirse con el código

  const [mems, exps, splits, pays] = await Promise.all([
    db.select().from(members).where(eq(members.houseId, id)),
    db.select().from(expenses).where(eq(expenses.houseId, id)),
    db
      .select({ s: expenseSplits })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(eq(expenses.houseId, id)),
    db.select().from(payments).where(eq(payments.houseId, id)),
  ]);

  const name = new Map(mems.map((m) => [m.id, m.displayName]));
  const money = (c: number) => formatCents(c, house.currency);

  const balances = netBalances(
    mems.map((m) => m.id),
    exps.map((e) => ({
      paidBy: e.paidBy,
      amountCents: e.amountCents,
      splits: splits
        .filter((x) => x.s.expenseId === e.id)
        .map((x) => ({ memberId: x.s.memberId, shareCents: x.s.shareCents })),
    })),
    pays
      .filter((p) => p.status === "settled")
      .map((p) => ({ fromMember: p.fromMember, toMember: p.toMember, amountCents: p.amountCents })),
  );
  const debts = simplifyDebts(balances);
  const sortedExps = [...exps].sort((a, b) => +b.createdAt - +a.createdAt);

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{house.name}</h1>
          <p className="text-sm text-zinc-500">
            Hola, {me.displayName} · {mems.length} roomie{mems.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="rounded-lg bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800">
          Código de invitación: <strong className="font-mono">{house.inviteCode}</strong>
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Cuentas</h2>
        <ul className="space-y-2">
          {mems.map((m) => {
            const b = balances.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span>{m.displayName}{m.isHost ? " (hospedante)" : ""}</span>
                <span className={b > 0 ? "text-emerald-600" : b < 0 ? "text-red-600" : "text-zinc-500"}>
                  {b > 0 ? `le deben ${money(b)}` : b < 0 ? `debe ${money(-b)}` : "al día"}
                </span>
              </li>
            );
          })}
        </ul>

        <h3 className="mb-2 mt-5 font-medium">Para quedar a mano</h3>
        {debts.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay deudas pendientes.</p>
        ) : (
          <ul className="space-y-2">
            {debts.map((d) => (
              <li key={`${d.from}-${d.to}`} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <span>
                  {name.get(d.from)} → {name.get(d.to)}: <strong>{money(d.amountCents)}</strong>
                </span>
                {/* Se conecta con NEAR Intents cuando esté el cliente de pagos */}
                <button disabled title="Próximamente: pago con NEAR Intents" className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white opacity-50">
                  Pagar con NEAR
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Nuevo gasto</h2>
        <form action={addExpense.bind(null, id)} className="space-y-3">
          <input name="description" placeholder="Descripción (ej: alquiler noviembre)" required maxLength={120} className={input} />
          <div className="flex gap-3">
            <input name="amount" placeholder={`Monto en ${house.currency}`} inputMode="decimal" required className={input} />
            <select name="category" className={input}>
              <option value="rent">Alquiler</option>
              <option value="utilities">Servicios</option>
              <option value="groceries">Compras</option>
              <option value="general">Otro</option>
            </select>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm text-zinc-500">Se divide entre</legend>
            <div className="flex flex-wrap gap-3">
              {mems.map((m) => (
                <label key={m.id} className="flex items-center gap-2">
                  <input type="checkbox" name="split" value={m.id} defaultChecked /> {m.displayName}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">
            Agregar gasto (lo pagaste vos)
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Gastos</h2>
        {sortedExps.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay gastos.</p>
        ) : (
          <ul className="space-y-2">
            {sortedExps.map((e) => (
              <li key={e.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span>
                  {e.description}
                  <span className="block text-xs text-zinc-500">pagó {name.get(e.paidBy)}</span>
                </span>
                <strong>{money(e.amountCents)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
