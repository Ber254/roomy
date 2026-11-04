import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, houses } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { NEAR_NETWORK } from "@/lib/near";
import { viewCall } from "@/lib/near-rpc";
import { councilOf, isHouseDaoAccount } from "@/lib/sputnik-ui";
import { getT } from "@/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Registra el DAO creado para la casa. Solo el hospedante, una sola vez, y solo si el DAO existe
 * on-chain, es subcuenta del factory y su consejo incluye la cuenta NEAR del hospedante.
 */
export async function POST(req: Request) {
  const t = await getT();
  const body = await req.json().catch(() => null);
  const { houseId, daoAccount } = (body ?? {}) as Record<string, unknown>;
  if (typeof houseId !== "string" || !UUID.test(houseId) || typeof daoAccount !== "string") return bad(t("api.badData"));

  const me = await getCurrentMember(houseId);
  if (!me) return bad(t("api.notMember"), 401);
  if (!me.isHost) return bad(t("api.hostOnlyDao"), 403);
  if (!me.nearAccount) return bad(t("api.setNearFirst"));
  if (!isHouseDaoAccount(daoAccount, NEAR_NETWORK)) return bad(t("api.badDao"));

  try {
    const policy = await viewCall<{ roles?: { name: string; kind: unknown }[] }>(daoAccount, "get_policy", {});
    if (!councilOf(policy).includes(me.nearAccount)) return bad(t("api.notInCouncil"), 403);
  } catch (e) {
    return bad(t("api.daoVerifyFail", { detail: e instanceof Error ? e.message : "error" }), 502);
  }

  const updated = await db
    .update(houses)
    .set({ daoAccount })
    .where(and(eq(houses.id, houseId), isNull(houses.daoAccount)))
    .returning({ id: houses.id });
  if (updated.length === 0) return bad(t("api.daoExists"), 409);
  return NextResponse.json({ ok: true, daoAccount });
}
