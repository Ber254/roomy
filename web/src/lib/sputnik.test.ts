import { describe, expect, it } from "vitest";
import {
  actProposalTx, addMemberProposalKind, addProposalTx, createDaoTx, housePolicy,
  transferProposalKind, voteProposalKind,
} from "./sputnik";

describe("housePolicy", () => {
  it("consejo = roomies, mayoría simple, bond bajo", () => {
    const p = housePolicy(["ana.near", "beto.near", "ana.near"]);
    const council = p.roles.find((r) => r.name === "council")!;
    expect(council.kind).toEqual({ Group: ["ana.near", "beto.near"] }); // sin duplicados
    expect(p.default_vote_policy).toEqual({ weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] });
    expect(p.proposal_bond).toBe("100000000000000000000000");
    expect(p.roles.find((r) => r.name === "all")!.permissions).toEqual(["*:AddProposal"]);
  });
  it("exige al menos un miembro", () => {
    expect(() => housePolicy([])).toThrow();
  });
});

describe("createDaoTx", () => {
  it("empaqueta config y policy en base64 para el factory", () => {
    const tx = createDaoTx("sputnikv2.testnet", "casa-sol", "Casa Sol", ["ana.testnet"], "6000000000000000000000000");
    const call = tx.actions[0].params;
    expect(tx.receiverId).toBe("sputnikv2.testnet");
    expect(call.methodName).toBe("create");
    expect(call.deposit).toBe("6000000000000000000000000");
    const args = call.args as { name: string; args: string };
    const inner = JSON.parse(Buffer.from(args.args, "base64").toString());
    expect(args.name).toBe("casa-sol");
    expect(inner.config).toMatchObject({ name: "casa-sol", metadata: "" });
    expect(inner.policy.roles[1].kind).toEqual({ Group: ["ana.testnet"] });
  });
  it("rechaza nombres inválidos", () => {
    for (const bad of ["", "a", "Casa", "casa.sol", "-x", "x".repeat(41)]) {
      expect(() => createDaoTx("f", bad, "h", ["a.near"], "1")).toThrow();
    }
  });
});

describe("propuestas y votos", () => {
  it("Vote es una variante sin datos", () => {
    const tx = addProposalTx("casa.sputnikv2.testnet", "¿Comprar un aspirador?", voteProposalKind());
    expect(tx.actions[0].params.args).toEqual({ proposal: { description: "¿Comprar un aspirador?", kind: "Vote" } });
    expect(tx.actions[0].params.deposit).toBe("100000000000000000000000"); // el bond es obligatorio
  });
  it("Transfer paga NEAR (token_id vacío)", () => {
    expect(transferProposalKind("hugo.near", "5")).toEqual({
      Transfer: { token_id: "", receiver_id: "hugo.near", amount: "5", msg: null },
    });
  });
  it("act_proposal reenvía el kind y solo manda los 4 argumentos esperados", () => {
    const tx = actProposalTx("d.near", 3, "VoteApprove", addMemberProposalKind("caro.near"));
    expect(tx.actions[0].params.args).toEqual({
      id: 3,
      action: "VoteApprove",
      proposal: { AddMemberToRole: { member_id: "caro.near", role: "council" } },
      memo: null,
    });
    expect(Object.keys(tx.actions[0].params.args)).toHaveLength(4);
  });
  it("valida entradas", () => {
    expect(() => addProposalTx("d", "  ", "Vote")).toThrow();
    expect(() => actProposalTx("d", -1, "VoteApprove", "Vote")).toThrow();
  });
});
