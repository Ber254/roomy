import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, houses } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { viewAccountBalance, viewCall } from "@/lib/near-rpc";
import { councilOf, type ProposalOut } from "@/lib/sputnik-ui";
import { getT } from "@/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 20;

/** Fondo, consejo y propuestas recientes del DAO de la casa (la cadena es la fuente de verdad). */
export async function GET(_: Request, { params }: { params: Promise<{ houseId: string }> }) {
  const t = await getT();
  const { houseId } = await params;
  if (!UUID.test(houseId)) return NextResponse.json({ error: t("api.badId") }, { status: 400 });
  if (!(await getCurrentMember(houseId))) return NextResponse.json({ error: t("api.unauth") }, { status: 401 });

  const [house] = await db.select({ dao: houses.daoAccount }).from(houses).where(eq(houses.id, houseId));
  if (!house) return NextResponse.json({ error: t("api.houseNotFound") }, { status: 404 });
  if (!house.dao) return NextResponse.json({ dao: null });

  try {
    const [balanceYocto, policy, last] = await Promise.all([
      viewAccountBalance(house.dao),
      viewCall<{ roles?: { name: string; kind: unknown }[]; proposal_bond?: string }>(house.dao, "get_policy", {}),
      viewCall<number>(house.dao, "get_last_proposal_id", {}),
    ]);
    const from = Math.max(0, last - RECENT);
    const proposals = await viewCall<ProposalOut[]>(house.dao, "get_proposals", { from_index: from, limit: RECENT });
    return NextResponse.json({
      dao: house.dao,
      balanceYocto,
      council: councilOf(policy),
      bondYocto: policy.proposal_bond ?? null, // el contrato exige exactamente este bond al proponer
      proposals: proposals.filter((p) => p.status !== "Removed").reverse(), // más nuevas primero
    });
  } catch (e) {
    return NextResponse.json({ dao: house.dao, error: e instanceof Error ? e.message : t("api.rpcError") }, { status: 502 });
  }
}
