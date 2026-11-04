import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, payments } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { loadHouseState } from "@/lib/house-data";
import { friendlyQuoteError, requestQuote, USDC_NEAR } from "@/lib/intents";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Cotiza (dry) o crea (dry=false) el pago de una deuda vía NEAR Intents.
 * La deuda se recalcula en el servidor: el cliente nunca decide el monto.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { houseId, toMemberId, originAsset, refundTo, dry } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof houseId !== "string" || typeof toMemberId !== "string" ||
    typeof originAsset !== "string" || typeof refundTo !== "string" || typeof dry !== "boolean" ||
    originAsset.length > 200 || refundTo.length < 2 || refundTo.length > 200
  ) {
    return bad("Datos inválidos");
  }

  const me = await getCurrentMember(houseId);
  if (!me) return bad("No sos miembro de esta casa", 401);
  const state = await loadHouseState(houseId);
  if (!state) return bad("Casa no encontrada", 404);

  const debt = state.debts.find((d) => d.from === me.id && d.to === toMemberId);
  if (!debt) return bad("No tenés una deuda pendiente con esa persona");
  const to = state.members.find((m) => m.id === toMemberId);
  if (!to?.nearAccount) return bad(`${to?.displayName ?? "El destinatario"} todavía no configuró su cuenta NEAR`);

  // Un solo pago abierto por par: evita pagar dos veces la misma deuda.
  if (!dry) {
    const [open] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.houseId, houseId),
          eq(payments.fromMember, me.id),
          eq(payments.toMember, toMemberId),
          inArray(payments.status, ["pending", "processing"]),
        ),
      );
    if (open) return NextResponse.json({ payment: open });
  }

  try {
    const q = await requestQuote({
      dry,
      originAsset,
      recipient: to.nearAccount,
      refundTo,
      amountOutCents: debt.amountCents,
    });
    if (dry) return NextResponse.json({ quote: q.quote });

    if (!q.quote.depositAddress) return bad("1Click no devolvió dirección de depósito", 502);
    const [payment] = await db
      .insert(payments)
      .values({
        houseId,
        fromMember: me.id,
        toMember: toMemberId,
        amountCents: debt.amountCents,
        originAsset,
        refundTo,
        destinationAsset: USDC_NEAR,
        depositAddress: q.quote.depositAddress,
        quote: q,
        deadline: q.quote.deadline ? new Date(q.quote.deadline) : null,
      })
      .returning();
    return NextResponse.json({ payment });
  } catch (e) {
    return bad(friendlyQuoteError(e instanceof Error ? e.message : "Error al cotizar"), 502);
  }
}
