import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, chores } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { loadHouseState } from "@/lib/house-data";
import { formatCents } from "@/lib/money";
import { getTokens } from "@/lib/intents";
import { addChore, addExpense, rollWeek, setNearAccount, toggleChore } from "@/app/actions";
import PayButton, { type TokenOption } from "@/components/PayButton";
import GuaranteePanel from "@/components/GuaranteePanel";
import DaoPanel from "@/components/DaoPanel";
import Chat from "@/components/Chat";
import { WalletButton, WalletProvider } from "@/components/WalletProvider";
import { ESCROW_CONTRACT, NEAR_NETWORK } from "@/lib/near";
import { previousWeek, weekStartUTC } from "@/lib/chores";
import { getT } from "@/i18n/server";
import type { Key } from "@/i18n";

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
  const t = await getT();
  const { id } = await params;
  const { error } = await searchParams;
  if (!UUID.test(id)) notFound();

  const state = await loadHouseState(id);
  if (!state) notFound();
  const me = await getCurrentMember(id);
  if (!me) redirect("/"); // sin cookie de miembro: debe unirse con el código

  const { house, members: mems, expenses: exps, payments: pays, balances, debts } = state;
  const name = new Map(mems.map((m) => [m.id, m.displayName]));
  const money = (c: number) => formatCents(c, house.currency, t.intl);
  const tokens = await loadTokenOptions();
  const allChores = await db.select().from(chores).where(eq(chores.houseId, id));
  const ws = weekStartUTC(new Date());
  const weekChores = allChores.filter((c) => +c.weekStart === +ws);
  const canRoll = weekChores.length === 0 && allChores.some((c) => +c.weekStart === +previousWeek(ws));
  const names = Object.fromEntries(mems.map((m) => [m.id, m.displayName]));
  const sortedExps = [...exps].sort((a, b) => +b.createdAt - +a.createdAt);
  const sortedPays = [...pays].sort((a, b) => +b.createdAt - +a.createdAt);
  const myAccount = mems.find((m) => m.id === me.id)?.nearAccount;
  const hostMember = mems.find((m) => m.isHost) ?? null;
  const tenants = mems
    .filter((m) => !m.isHost)
    .map((m) => ({ memberId: m.id, name: m.displayName, nearAccount: m.nearAccount }));

  return (
    <WalletProvider network={NEAR_NETWORK}>
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{house.name}</h1>
          <p className="text-sm text-zinc-500">
            {t("h.hello", { name: me.displayName })} · {t(mems.length === 1 ? "h.roomies.one" : "h.roomies.other", { n: mems.length })}
          </p>
        </div>
        <p className="rounded-lg bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800">
          {t("h.invite")} <strong className="font-mono">{house.inviteCode}</strong>
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xl font-semibold">{t("h.nearTitle")}</h2>
        <form action={setNearAccount.bind(null, id)} className="flex gap-2">
          <input name="nearAccount" defaultValue={myAccount ?? ""} placeholder={t("h.nearPlaceholder")} required className={input} />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">{t("h.save")}</button>
        </form>
        <p className="mt-1 text-xs text-zinc-500">{t("h.nearHint")}</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.accounts")}</h2>
        <ul className="space-y-2">
          {mems.map((m) => {
            const b = balances.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span>{m.displayName}{m.isHost ? t("h.host") : ""}</span>
                <span className={b > 0 ? "text-emerald-600" : b < 0 ? "text-red-600" : "text-zinc-500"}>
                  {b > 0 ? t("h.owed", { amount: money(b) }) : b < 0 ? t("h.owes", { amount: money(-b) }) : t("h.even")}
                </span>
              </li>
            );
          })}
        </ul>

        <h3 className="mb-2 mt-5 font-medium">{t("h.settle")}</h3>
        {debts.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("h.noDebts")}</p>
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
                      <span className="text-xs text-zinc-500">{t("h.tokensFail")}</span>
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

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">{t("h.walletSection")}</h2>
        <WalletButton />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.daoSection")}</h2>
        <DaoPanel
          houseId={id}
          houseName={house.name}
          isHost={me.isHost}
          members={mems.map((m) => ({ memberId: m.id, name: m.displayName, nearAccount: m.nearAccount, isHost: m.isHost }))}
          createDepositNear={process.env.NEXT_PUBLIC_DAO_CREATE_DEPOSIT_NEAR ?? "6"}
        />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.guaranteeSection")}</h2>
        {ESCROW_CONTRACT ? (
          <GuaranteePanel
            houseId={id}
            escrow={ESCROW_CONTRACT}
            tenants={tenants}
            host={hostMember ? { name: hostMember.displayName, nearAccount: hostMember.nearAccount } : null}
          />
        ) : (
          <p className="text-sm text-zinc-500">{t("h.escrowMissing")}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.choresTitle")}</h2>
        {weekChores.length === 0 ? (
          <p className="mb-3 text-sm text-zinc-500">{t("h.noChores")}</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {weekChores.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span className={c.done ? "text-zinc-400 line-through" : ""}>
                  {c.title}
                  <span className="block text-xs text-zinc-500">
                    {t("h.choreTurn", { name: c.assignedTo ? (name.get(c.assignedTo) ?? "?") : t("h.choreNobody") })}
                  </span>
                </span>
                <form action={toggleChore.bind(null, id, c.id)}>
                  <button className="rounded-md border border-zinc-400 px-3 py-1 text-sm">{c.done ? t("h.undo") : t("h.done")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {canRoll && (
          <form action={rollWeek.bind(null, id)} className="mb-3">
            <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              {t("h.roll")}
            </button>
          </form>
        )}
        <form action={addChore.bind(null, id)} className="flex gap-2">
          <input name="title" placeholder={t("h.choreNew")} required maxLength={60} className={input} />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">{t("h.add")}</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.chatTitle")}</h2>
        <Chat houseId={id} meId={me.id} names={names} />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.newExpense")}</h2>
        <form action={addExpense.bind(null, id)} className="space-y-3">
          <input name="description" placeholder={t("h.expDesc")} required maxLength={120} className={input} />
          <div className="flex gap-3">
            <input name="amount" placeholder={t("h.expAmount", { currency: house.currency })} inputMode="decimal" required className={input} />
            <select name="category" className={input}>
              {(["rent", "utilities", "groceries", "general"] as const).map((c) => (
                <option key={c} value={c}>{t(`h.cat.${c}` as Key)}</option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm text-zinc-500">{t("h.splitAmong")}</legend>
            <div className="flex flex-wrap gap-3">
              {mems.map((m) => (
                <label key={m.id} className="flex items-center gap-2">
                  <input type="checkbox" name="split" value={m.id} defaultChecked /> {m.displayName}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">
            {t("h.addExpenseBtn")}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("h.expenses")}</h2>
        {sortedExps.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("h.noExpenses")}</p>
        ) : (
          <ul className="space-y-2">
            {sortedExps.map((e) => (
              <li key={e.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span>
                  {e.description}
                  <span className="block text-xs text-zinc-500">{t("h.paidBy", { name: name.get(e.paidBy) ?? "?" })}</span>
                </span>
                <strong>{money(e.amountCents)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sortedPays.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t("h.payments")}</h2>
          <ul className="space-y-2">
            {sortedPays.map((p) => (
              <li key={p.id} className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span>
                  {name.get(p.fromMember)} → {name.get(p.toMember)}
                  <span className="block text-xs text-zinc-500">{t(`pay.status.${p.status}` as Key)}{p.txHash ? ` · ${p.txHash.slice(0, 12)}…` : ""}</span>
                </span>
                <strong>{money(p.amountCents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
    </WalletProvider>
  );
}
