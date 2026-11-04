import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, members } from "@/db";

// Una cookie por casa guarda el token de sesión del miembro (sin auth con wallet en el MVP).
const cookieName = (houseId: string) => `roomy_${houseId.replace(/-/g, "")}`;

export async function setMemberCookie(houseId: string, token: string) {
  (await cookies()).set(cookieName(houseId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Devuelve el miembro de la casa dueño de la cookie, o null. */
export async function getCurrentMember(houseId: string) {
  const token = (await cookies()).get(cookieName(houseId))?.value;
  if (!token) return null;
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.houseId, houseId), eq(members.sessionToken, token)));
  return m ?? null;
}
