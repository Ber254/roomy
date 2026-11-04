import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { loadHouseState } from "@/lib/house-data";
import { formatCents } from "@/lib/money";
import { getTokens } from "@/lib/intents";
import { addExpense, setNearAccount } from "@/app/actions";
import PayButton, { type TokenOption } from "@/components/PayButton";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

// Activos con los que un roomie puede pagar: stablecoins en cualquier red y wNEAR.
async function loadTokenOptions(): Promise<TokenOption[]> {
  try {
    const all = await getTokens();
    return all
      .filter((t) => ["USDC", "USDT"].includes(t.symbol) || (t.symbol === "wNEAR" && t.blockchain === "near"))
      .map((t) => ({ assetId: t.assetId, label: `${t.symbol} · ${t.blockchain}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

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

  const state = await loadHouseState(id);
  if (!state) notFound();
  const me = await getCurrentMember(id);
  if (!me) redirect("/"); // sin cookie de miembro: debe unirse con el código

  const { house, members: mems, expenses: exps, payments: pays, balances, debts } = state;
  const name = new Map(mems.map((m) => [m.id, m.displayName]));
  const money = (c: number) => formatCents(c, house.currency);
  const tokens = await loadTokenOptions();
  const sortedExps = [...exps].sort((a, b) => +b.createdAt - +a.createdAt);
  const sortedPays = [...pays].sort((a, b) => +b.createdAt - +a.createdAt);
  const myAccount = mems.find((m) => m.id === me.id)?.nearAccount;

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
        <h2 className="mb-2 text-xl font-semibold">Tu cuenta NEAR</h2>
        <form action={setNearAccount.bind(null, id)} className="flex gap-2">
          <input name="nearAccount" defaultValue={myAccount ?? ""} placeholder="tunombre.near" required className={input} />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">Guardar</button>
        </form>
        <p className="mt-1 text-xs text-zinc-500">Ahí recibís USDC cuando te pagan una deuda.</p>
      </section>

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
            {debts.map((d) => {
              const to = mems.find((m) => m.id === d.to)!;
              const mine = d.from === me.id;
              const open = pays.find(
                (p) => p.fromMember === d.from && p.toMember === d.to && ["pending", "processing"].includes(p.status),
              );
              return (
                <li key={`${d.from}-${d.to}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  <span>
                    {name.get(d.from)} → {name.get(d.to)}: <strong>{money(d.amountCents)}</strong>
                  </span>
                  {mine &&
                    (tokens.length === 0 ? (
                      <span className="text-xs text-zinc-500">No se pudo cargar la lista de activos</span>
                    ) : (
                      <PayButton
                        houseId={id}
                        toMemberId={d.to}
                        toName={to.displayName}
                        amountLabel={money(d.amountCents)}
                        tokens={tokens}
                        toHasNear={!!to.nearAccount}
                        existing={open ? JSON.parse(JSON.stringify(open)) : null}
                      />
                    ))}
                </li>
              );
            })}
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

      {sortedPays.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Pagos</h2>
          <ul className="space-y-2">
            {sortedPays.map((p) => (
              <li key={p.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span>
                  {name.get(p.fromMember)} → {name.get(p.toMember)}
                  <span className="block text-xs text-zinc-500">{p.status}{p.txHash ? ` · ${p.txHash.slice(0, 12)}…` : ""}</span>
                </span>
                <strong>{money(p.amountCents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
