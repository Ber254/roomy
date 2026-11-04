import { eq } from "drizzle-orm";
import { db, houses, members, expenses, expenseSplits, payments } from "@/db";
import { netBalances, simplifyDebts } from "./balances";

/** Carga una casa con balances y deudas simplificadas. Los pagos `settled` ya descuentan deuda. */
export async function loadHouseState(houseId: string) {
  const [house] = await db.select().from(houses).where(eq(houses.id, houseId));
  if (!house) return null;

  const [mems, exps, splits, pays] = await Promise.all([
    db.select().from(members).where(eq(members.houseId, houseId)),
    db.select().from(expenses).where(eq(expenses.houseId, houseId)),
    db
      .select({ s: expenseSplits })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(eq(expenses.houseId, houseId)),
    db.select().from(payments).where(eq(payments.houseId, houseId)),
  ]);

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

  return { house, members: mems, expenses: exps, payments: pays, balances, debts: simplifyDebts(balances) };
}
