import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db, messages } from "@/db";
import { getCurrentMember } from "@/lib/session";
import { CHAT_PAGE, cleanMessage } from "@/lib/chat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
const out = (m: typeof messages.$inferSelect) => ({
  id: m.id, authorId: m.authorId, body: m.body, createdAt: m.createdAt.toISOString(),
});

/** Mensajes de la casa. Sin `after`: los últimos 50. Con `after` (ISO): solo los más nuevos. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const houseId = url.searchParams.get("houseId") ?? "";
  if (!UUID.test(houseId)) return err("Id inválido");
  if (!(await getCurrentMember(houseId))) return err("No autorizado", 401);

  const afterRaw = url.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  if (after && Number.isNaN(after.getTime())) return err("Fecha inválida");

  const rows = after
    ? await db.select().from(messages).where(and(eq(messages.houseId, houseId), gt(messages.createdAt, after))).orderBy(asc(messages.createdAt)).limit(200)
    : (await db.select().from(messages).where(eq(messages.houseId, houseId)).orderBy(desc(messages.createdAt)).limit(CHAT_PAGE)).reverse();
  return NextResponse.json({ messages: rows.map(out) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { houseId, text } = (body ?? {}) as Record<string, unknown>;
  if (typeof houseId !== "string" || !UUID.test(houseId)) return err("Datos inválidos");
  const me = await getCurrentMember(houseId);
  if (!me) return err("No autorizado", 401);
  const clean = cleanMessage(text);
  if (!clean) return err("Mensaje vacío o demasiado largo");

  const [row] = await db.insert(messages).values({ houseId, authorId: me.id, body: clean }).returning();
  return NextResponse.json({ message: out(row) });
}
