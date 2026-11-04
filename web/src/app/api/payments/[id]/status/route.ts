import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, payments } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { getStatus, isFinal } from "@/lib/intents";
import { mapSwapStatus } from "@/lib/payments";
import { getT } from "@/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consulta a 1Click y sincroniza el estado del pago. Solo miembros de la casa. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: t("api.badId") }, { status: 400 });

  const [p] = await db.select().from(payments).where(eq(payments.id, id));
  if (!p) return NextResponse.json({ error: t("api.paymentNotFound") }, { status: 404 });
  if (!(await getCurrentMember(p.houseId))) return NextResponse.json({ error: t("api.unauth") }, { status: 401 });
  if (!p.depositAddress) return NextResponse.json({ payment: p });
  if (p.status === "settled" || p.status === "refunded" || p.status === "failed") {
    return NextResponse.json({ payment: p });
  }

  try {
    const s = await getStatus(p.depositAddress);
    const status = mapSwapStatus(s.status);
    const txHash =
      s.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? s.swapDetails?.nearTxHashes?.[0] ?? p.txHash;
    const [updated] = await db
      .update(payments)
      .set({
        status,
        intentsStatus: s.status,
        txHash,
        settledAt: isFinal(s.status) ? new Date() : null,
      })
      .where(eq(payments.id, id))
      .returning();
    return NextResponse.json({ payment: updated });
  } catch (e) {
    // 404 de 1Click = todavía no vio el depósito: se mantiene el estado actual
    return NextResponse.json({ payment: p, note: e instanceof Error ? e.message : "sin estado" });
  }
}
