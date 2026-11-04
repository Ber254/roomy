import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, members } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { ESCROW_CONTRACT, guaranteeId } from "@/lib/near";
import { viewCall } from "@/lib/near-rpc";
import { getT } from "@/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estado on-chain de la garantía de un inquilino (la cadena es la fuente de verdad). */
export async function GET(_: Request, { params }: { params: Promise<{ houseId: string; memberId: string }> }) {
  const t = await getT();
  const { houseId, memberId } = await params;
  if (!UUID.test(houseId) || !UUID.test(memberId)) {
    return NextResponse.json({ error: t("api.badId") }, { status: 400 });
  }
  if (!(await getCurrentMember(houseId))) return NextResponse.json({ error: t("api.unauth") }, { status: 401 });
  if (!ESCROW_CONTRACT) return NextResponse.json({ deployed: false });

  // el inquilino debe pertenecer a esta casa
  const [m] = await db.select().from(members).where(eq(members.id, memberId));
  if (!m || m.houseId !== houseId) return NextResponse.json({ error: t("api.memberMissing") }, { status: 404 });

  const id = guaranteeId(houseId, memberId);
  try {
    const [guarantee, settlement, agreement] = await Promise.all([
      viewCall(ESCROW_CONTRACT, "get_guarantee", { id }),
      viewCall(ESCROW_CONTRACT, "get_settlement", { id }),
      viewCall(ESCROW_CONTRACT, "get_agreement", { id }),
    ]);
    return NextResponse.json({ deployed: true, guarantee, settlement, agreement });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : t("api.rpcError") }, { status: 502 });
  }
}
