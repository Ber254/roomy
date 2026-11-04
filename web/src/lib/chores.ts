// Lógica pura de tareas por turnos. Semanas desde el lunes 00:00 UTC.

export function weekStartUTC(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

export const previousWeek = (ws: Date) => new Date(ws.getTime() - 7 * 24 * 60 * 60 * 1000);

/** Asignación inicial: reparte las tareas de a una entre los miembros, en orden. */
export function assignRoundRobin(existingCount: number, memberIds: string[]): string {
  if (memberIds.length === 0) throw new Error("No hay miembros");
  return memberIds[existingCount % memberIds.length];
}

/**
 * Rota la semana anterior: cada tarea pasa al siguiente miembro de la lista.
 * Si quien la tenía ya no está en la casa, se reparte por orden.
 */
export function rotateAssignments(
  previous: { title: string; assignedTo: string | null }[],
  memberIds: string[],
): { title: string; assignedTo: string }[] {
  if (memberIds.length === 0) throw new Error("No hay miembros");
  return previous.map((c, i) => {
    const idx = c.assignedTo ? memberIds.indexOf(c.assignedTo) : -1;
    return { title: c.title, assignedTo: memberIds[idx === -1 ? i % memberIds.length : (idx + 1) % memberIds.length] };
  });
}
