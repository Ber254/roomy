import { describe, expect, it } from "vitest";
import { assignRoundRobin, previousWeek, rotateAssignments, weekStartUTC } from "./chores";

describe("weekStartUTC", () => {
  it("devuelve el lunes 00:00 UTC", () => {
    expect(weekStartUTC(new Date("2026-11-04T15:30:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // miércoles
    expect(weekStartUTC(new Date("2026-11-02T00:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // lunes
    expect(weekStartUTC(new Date("2026-11-08T23:59:59Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // domingo
    expect(previousWeek(new Date("2026-11-02T00:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("turnos", () => {
  const ids = ["ana", "beto", "caro"];
  it("reparte en orden y da la vuelta", () => {
    expect([0, 1, 2, 3].map((n) => assignRoundRobin(n, ids))).toEqual(["ana", "beto", "caro", "ana"]);
    expect(() => assignRoundRobin(0, [])).toThrow();
  });
  it("rota cada tarea al siguiente miembro", () => {
    const out = rotateAssignments(
      [{ title: "Cocina", assignedTo: "ana" }, { title: "Baño", assignedTo: "caro" }],
      ids,
    );
    expect(out).toEqual([{ title: "Cocina", assignedTo: "beto" }, { title: "Baño", assignedTo: "ana" }]);
  });
  it("si quien la tenía se fue, reparte por orden", () => {
    const out = rotateAssignments([{ title: "Basura", assignedTo: "ex" }, { title: "Piso", assignedTo: null }], ids);
    expect(out.map((x) => x.assignedTo)).toEqual(["ana", "beto"]);
  });
});
