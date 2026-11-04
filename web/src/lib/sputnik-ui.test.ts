import { describe, expect, it } from "vitest";
import { makeT } from "@/i18n";
import { canVote, councilOf, daoAccountId, describeKind, isHouseDaoAccount, myVote, slugifyDaoName, tally, type ProposalOut } from "./sputnik-ui";

const T = makeT("es");
const base: ProposalOut = {
  id: 1, proposer: "ana.near", description: "x", kind: "Vote", status: "InProgress",
  vote_counts: { council: ["2", "1", "0"] }, votes: { "ana.near": "Approve" }, submission_time: "1",
};

describe("slugifyDaoName", () => {
  it("genera nombres válidos", () => {
    expect(slugifyDaoName("Casa del Sol")).toBe("casa-del-sol");
    expect(slugifyDaoName("Piso Ñandú 2º")).toBe("piso-nandu-2");
    expect(slugifyDaoName("!!")).toMatch(/^[a-z\d]+([-_][a-z\d]+)*$/);
    expect(slugifyDaoName("x".repeat(80)).length).toBeLessThanOrEqual(30);
  });
});

describe("cuentas de DAO", () => {
  it("solo subcuentas directas del factory de la red", () => {
    expect(daoAccountId("casa-sol", "testnet")).toBe("casa-sol.sputnikv2.testnet");
    expect(isHouseDaoAccount("casa-sol.sputnikv2.testnet", "testnet")).toBe(true);
    expect(isHouseDaoAccount("casa-sol.sputnikv2.testnet", "mainnet")).toBe(false);
    expect(isHouseDaoAccount("a.b.sputnikv2.testnet", "testnet")).toBe(false);
    expect(isHouseDaoAccount("sputnikv2.testnet", "testnet")).toBe(false);
    expect(isHouseDaoAccount("evil.near", "testnet")).toBe(false);
  });
});

describe("propuestas", () => {
  it("describe cada tipo", () => {
    expect(describeKind("Vote", T)).toBe("Decisión de la casa");
    expect(describeKind({ Transfer: { token_id: "", receiver_id: "hugo.near", amount: "1500000000000000000000000", msg: "" } }, T))
      .toBe("Pago del fondo: 1.5 NEAR a hugo.near");
    expect(describeKind({ AddMemberToRole: { member_id: "caro.near", role: "council" } }, T)).toBe("Agregar roomie: caro.near");
    expect(describeKind({ Otra: {} }, T)).toBe("Otra propuesta");
  });
  it("suma votos de todos los roles", () => {
    expect(tally(base)).toEqual({ yes: 2, no: 1, spam: 0 });
    expect(tally({ vote_counts: {} })).toEqual({ yes: 0, no: 0, spam: 0 });
  });
  it("solo vota quien está en el consejo y no votó, en una propuesta abierta", () => {
    expect(canVote(base, "beto.near", ["ana.near", "beto.near"])).toBe(true);
    expect(canVote(base, "ana.near", ["ana.near", "beto.near"])).toBe(false); // ya votó
    expect(canVote(base, "eve.near", ["ana.near"])).toBe(false); // ajeno
    expect(canVote({ ...base, status: "Approved" }, "beto.near", ["beto.near"])).toBe(false);
    expect(canVote(base, null, ["ana.near"])).toBe(false);
    expect(myVote(base, "ana.near")).toBe("Approve");
  });
  it("describe las propuestas también en inglés", () => {
    expect(describeKind("Vote", makeT("en"))).toBe("House decision");
    expect(describeKind({ AddMemberToRole: { member_id: "caro.near", role: "council" } }, makeT("en"))).toBe("Add roommate: caro.near");
  });
  it("lee el consejo de la política", () => {
    expect(councilOf({ roles: [{ name: "all", kind: "Everyone" }, { name: "council", kind: { Group: ["a.near", "b.near"] } }] }))
      .toEqual(["a.near", "b.near"]);
    expect(councilOf(null)).toEqual([]);
  });
});
