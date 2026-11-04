export const MAX_MESSAGE_LENGTH = 1000;
export const CHAT_PAGE = 50;

export type ChatMessage = { id: string; authorId: string; body: string; createdAt: string };

/** Une mensajes nuevos con los existentes: sin duplicados y ordenados por fecha. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Normaliza el texto enviado: recorta y rechaza vacío o excedido. */
export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 && t.length <= MAX_MESSAGE_LENGTH ? t : null;
}
