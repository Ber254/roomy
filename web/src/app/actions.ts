"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n";
import { getT } from "@/i18n/server";
import { db, houses, members, expenses, expenseSplits, chores } from "@/db";
import { getCurrentMember, setMemberCookie } from "@/lib/session";
import { parseAmountToCents } from "@/lib/money";
import { splitEvenly } from "@/lib/balances";
import { isNearAccount } from "@/lib/payments";
import { assignRoundRobin, previousWeek, rotateAssignments, weekStartUTC } from "@/lib/chores";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
const inviteCode = () =>
  Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

const text = (fd: FormData, k: string, max: number) =>
  String(fd.get(k) ?? "").trim().slice(0, max);

const fail = (path: string, msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

export async function createHouse(fd: FormData) {
  const t = await getT();
  const name = text(fd, "name", 60);
  const displayName = text(fd, "displayName", 40);
  if (!name || !displayName) fail("/", t("err.houseFields"));

  const houseId = randomUUID();
  const token = randomBytes(24).toString("hex");
  await db.batch([
    db.insert(houses).values({ id: houseId, name, inviteCode: inviteCode() }),
    db.insert(members).values({
      houseId,
      displayName,
      isHost: true,
      sessionToken: token,
    }),
  ]);
  await setMemberCookie(houseId, token);
  redirect(`/h/${houseId}`);
}

export async function joinHouse(fd: FormData) {
  const t = await getT();
  const code = text(fd, "code", 12).toUpperCase();
  const displayName = text(fd, "displayName", 40);
  if (!code || !displayName) fail("/", t("err.joinFields"));

  const [house] = await db.select().from(houses).where(eq(houses.inviteCode, code));
  if (!house) fail("/", t("err.badCode"));

  const token = randomBytes(24).toString("hex");
  await db.insert(members).values({
    houseId: house.id,
    displayName,
    sessionToken: token,
  });
  await setMemberCookie(house.id, token);
  redirect(`/h/${house.id}`);
}

export async function addExpense(houseId: string, fd: FormData) {
  const t = await getT();
  const me = await getCurrentMember(houseId);
  if (!me) redirect("/");
  const path = `/h/${houseId}`;

  const description = text(fd, "description", 120);
  const category = text(fd, "category", 20) || "general";
  const cents = parseAmountToCents(String(fd.get("amount") ?? ""));
  if (!description) fail(path, t("err.expenseDesc"));
  if (cents === null) fail(path, t("err.expenseAmount"));

  // Solo miembros de ESTA casa pueden participar del gasto.
  const houseMembers = await db.select().from(members).where(eq(members.houseId, houseId));
  const valid = new Set(houseMembers.map((m) => m.id));
  const picked = fd.getAll("split").map(String).filter((id) => valid.has(id));
  if (picked.length === 0) fail(path, t("err.expenseSplit"));

  const expenseId = randomUUID();
  const splits = splitEvenly(cents!, picked);
  await db.batch([
    db.insert(expenses).values({
      id: expenseId,
      houseId,
      paidBy: me!.id,
      description,
      category,
      amountCents: cents!,
    }),
    db.insert(expenseSplits).values(
      splits.map((s) => ({ expenseId, memberId: s.memberId, shareCents: s.shareCents })),
    ),
  ]);
  redirect(path);
}

export async function setNearAccount(houseId: string, fd: FormData) {
  const t = await getT();
  const me = await getCurrentMember(houseId);
  if (!me) redirect("/");
  const path = `/h/${houseId}`;
  const account = text(fd, "nearAccount", 64).toLowerCase();
  if (!isNearAccount(account)) fail(path, t("err.nearInvalid"));
  await db.update(members).set({ nearAccount: account }).where(eq(members.id, me!.id));
  redirect(path);
}

// ---------- tareas con turnos ----------

const orderedMemberIds = async (houseId: string) =>
  (await db.select().from(members).where(eq(members.houseId, houseId)).orderBy(asc(members.joinedAt), asc(members.id))).map((m) => m.id);

export async function addChore(houseId: string, fd: FormData) {
  const t = await getT();
  const me = await getCurrentMember(houseId);
  if (!me) redirect("/");
  const path = `/h/${houseId}`;
  const title = text(fd, "title", 60);
  if (!title) fail(path, t("err.choreTitle"));

  const ws = weekStartUTC(new Date());
  const [ids, current] = await Promise.all([
    orderedMemberIds(houseId),
    db.select().from(chores).where(and(eq(chores.houseId, houseId), eq(chores.weekStart, ws))),
  ]);
  await db.insert(chores).values({
    houseId,
    title,
    weekStart: ws,
    assignedTo: assignRoundRobin(current.length, ids),
  });
  redirect(path);
}

/** Solo quien tiene la tarea o el hospedante pueden marcarla. */
export async function toggleChore(houseId: string, choreId: string) {
  const t = await getT();
  const me = await getCurrentMember(houseId);
  if (!me) redirect("/");
  const [c] = await db.select().from(chores).where(and(eq(chores.id, choreId), eq(chores.houseId, houseId)));
  if (!c) fail(`/h/${houseId}`, t("err.choreNotFound"));
  if (c!.assignedTo !== me!.id && !me!.isHost) fail(`/h/${houseId}`, t("err.choreForbidden"));
  await db.update(chores).set({ done: !c!.done }).where(eq(chores.id, choreId));
  redirect(`/h/${houseId}`);
}

/** Pasa a la semana actual: copia las tareas de la anterior y las rota al siguiente roomie. */
export async function rollWeek(houseId: string) {
  const t = await getT();
  const me = await getCurrentMember(houseId);
  if (!me) redirect("/");
  const path = `/h/${houseId}`;
  const ws = weekStartUTC(new Date());

  const existing = await db.select().from(chores).where(and(eq(chores.houseId, houseId), eq(chores.weekStart, ws)));
  if (existing.length > 0) redirect(path); // ya está hecha
  const prev = await db.select().from(chores).where(and(eq(chores.houseId, houseId), eq(chores.weekStart, previousWeek(ws))));
  if (prev.length === 0) fail(path, t("err.choreNoPrev"));

  const next = rotateAssignments(prev.map((c) => ({ title: c.title, assignedTo: c.assignedTo })), await orderedMemberIds(houseId));
  await db.insert(chores).values(next.map((c) => ({ houseId, title: c.title, assignedTo: c.assignedTo, weekStart: ws })));
  redirect(path);
}

// ---------- idioma ----------

/** Guarda el idioma elegido en una cookie (1 año). El cliente refresca la página después. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
