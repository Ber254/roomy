// Lógica pura de balances. Montos en centavos (enteros).

export type Expense = {
  paidBy: string;
  amountCents: number;
  // cuánto le toca pagar a cada miembro involucrado
  splits: { memberId: string; shareCents: number }[];
};

export type Settlement = {
  fromMember: string;
  toMember: string;
  amountCents: number;
};

export type Transfer = { from: string; to: string; amountCents: number };

/** Reparte `amountCents` en partes iguales sin perder centavos (el resto va a los primeros). */
export function splitEvenly(
  amountCents: number,
  memberIds: string[],
): { memberId: string; shareCents: number }[] {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error("amountCents debe ser un entero >= 0");
  }
  if (memberIds.length === 0) throw new Error("Se necesita al menos un miembro");
  const base = Math.floor(amountCents / memberIds.length);
  let remainder = amountCents - base * memberIds.length;
  return memberIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { memberId, shareCents: base + extra };
  });
}

/**
 * Balance neto por miembro: positivo = le deben, negativo = debe.
 * Un pago ya liquidado (from -> to) reduce la deuda de `from` y el crédito de `to`.
 */
export function netBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[] = [],
): Map<string, number> {
  const bal = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: number) => {
    if (!bal.has(id)) throw new Error(`Miembro desconocido: ${id}`);
    bal.set(id, bal.get(id)! + delta);
  };

  for (const e of expenses) {
    const total = e.splits.reduce((s, x) => s + x.shareCents, 0);
    if (total !== e.amountCents) {
      throw new Error(
        `Los splits (${total}) no suman el gasto (${e.amountCents})`,
      );
    }
    add(e.paidBy, e.amountCents);
    for (const s of e.splits) add(s.memberId, -s.shareCents);
  }
  for (const p of settlements) {
    add(p.fromMember, p.amountCents);
    add(p.toMember, -p.amountCents);
  }
  return bal;
}

/** Simplifica deudas: deudores pagan a acreedores con pocas transferencias (greedy). */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const creditors = [...balances]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const debtors = [...balances]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
