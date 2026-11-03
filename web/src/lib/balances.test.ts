import { describe, expect, it } from "vitest";
import { netBalances, simplifyDebts, splitEvenly } from "./balances";

describe("splitEvenly", () => {
  it("no pierde centavos", () => {
    const s = splitEvenly(1000, ["a", "b", "c"]);
    expect(s.map((x) => x.shareCents)).toEqual([334, 333, 333]);
    expect(s.reduce((t, x) => t + x.shareCents, 0)).toBe(1000);
  });
  it("rechaza montos inválidos", () => {
    expect(() => splitEvenly(10.5, ["a"])).toThrow();
    expect(() => splitEvenly(100, [])).toThrow();
  });
});

describe("netBalances + simplifyDebts", () => {
  const ids = ["ana", "beto", "caro"];

  it("alquiler pagado por ana, dividido en 3", () => {
    const bal = netBalances(ids, [
      { paidBy: "ana", amountCents: 90000, splits: splitEvenly(90000, ids) },
    ]);
    expect(bal.get("ana")).toBe(60000);
    expect(bal.get("beto")).toBe(-30000);
    expect(bal.get("caro")).toBe(-30000);
    const t = simplifyDebts(bal);
    expect(t).toEqual([
      { from: "beto", to: "ana", amountCents: 30000 },
      { from: "caro", to: "ana", amountCents: 30000 },
    ]);
  });

  it("un pago liquidado reduce la deuda", () => {
    const bal = netBalances(
      ids,
      [{ paidBy: "ana", amountCents: 90000, splits: splitEvenly(90000, ids) }],
      [{ fromMember: "beto", toMember: "ana", amountCents: 30000 }],
    );
    expect(bal.get("beto")).toBe(0);
    expect(simplifyDebts(bal)).toEqual([
      { from: "caro", to: "ana", amountCents: 30000 },
    ]);
  });

  it("los balances siempre suman cero", () => {
    const bal = netBalances(ids, [
      { paidBy: "ana", amountCents: 1001, splits: splitEvenly(1001, ids) },
      { paidBy: "beto", amountCents: 777, splits: splitEvenly(777, ["beto", "caro"]) },
    ]);
    expect([...bal.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("falla si los splits no suman el gasto", () => {
    expect(() =>
      netBalances(ids, [
        { paidBy: "ana", amountCents: 100, splits: [{ memberId: "ana", shareCents: 50 }] },
      ]),
    ).toThrow();
  });
});
