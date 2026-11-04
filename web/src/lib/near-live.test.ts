// Pruebas contra la red real de NEAR (solo lectura, no firman nada).
// Correr con: NEAR_LIVE=1 npm test   (en entornos con proxy: NODE_USE_ENV_PROXY=1 NEAR_LIVE=1 npm test)
import { describe, expect, it } from "vitest";
import { viewAccountBalance, viewCall } from "./near-rpc";
import { makeT } from "@/i18n";
import { housePolicy } from "./sputnik";
import { councilOf, describeKind, tally, type ProposalOut } from "./sputnik-ui";

// DAOs públicos de testnet usados como referencia de formato. Si desaparecen, la prueba lo avisa y no falla.
const POLICY_DAO = "hootbridgetest.sputnikv2.testnet";
const VOTE_DAO = "x207v8.sputnikv2.testnet";
const TRANSFER_DAO = "streak-demo-1.sputnikv2.testnet";
const FACTORY = "sputnikv2.testnet";

async function orSkip<T>(label: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.warn(`[near-live] ${label} no disponible: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// el RPC puede tardar varios segundos, sobre todo detrás de un proxy
const TIMEOUT = 60_000;

describe.runIf(process.env.NEAR_LIVE === "1")("NEAR testnet en vivo", { timeout: TIMEOUT }, () => {
  it("el factory de Sputnik existe y tiene DAOs", async () => {
    expect(await viewCall<number>(FACTORY, "get_number_daos", {})).toBeGreaterThan(1000);
    expect(BigInt(await viewAccountBalance(FACTORY))).toBeGreaterThan(BigInt(0));
  });

  it("nuestra política de casa tiene la misma forma que la de un DAO real", async () => {
    const real = await orSkip(POLICY_DAO, () => viewCall<Record<string, unknown> & { roles: { name: string; permissions: string[] }[] }>(POLICY_DAO, "get_policy", {}));
    if (!real) return;
    const ours = housePolicy(["ana.testnet"]);
    expect(Object.keys(ours).sort()).toEqual(Object.keys(real).sort());
    expect(ours.roles.map((r) => r.name)).toEqual(real.roles.map((r) => r.name));
    for (const r of ours.roles) {
      const theirs = real.roles.find((x) => x.name === r.name)!;
      expect([...r.permissions].sort()).toEqual([...theirs.permissions].sort());
    }
    expect(ours.default_vote_policy).toEqual(real.default_vote_policy);
    expect(councilOf(real as never).length).toBeGreaterThan(0);
  });

  it("lee propuestas Vote y Transfer reales con nuestras utilidades", async () => {
    const vote = await orSkip(VOTE_DAO, () => viewCall<ProposalOut[]>(VOTE_DAO, "get_proposals", { from_index: 0, limit: 20 }));
    const voteProp = vote?.find((p) => p.kind === "Vote");
    if (voteProp) {
      expect(describeKind(voteProp.kind, makeT("es"))).toBe("Decisión de la casa");
      const t = tally(voteProp);
      expect(t.yes + t.no + t.spam).toBeGreaterThan(0);
    }
    const tr = await orSkip(TRANSFER_DAO, () => viewCall<ProposalOut[]>(TRANSFER_DAO, "get_proposals", { from_index: 0, limit: 20 }));
    const trProp = tr?.find((p) => typeof p.kind === "object" && p.kind !== null && "Transfer" in (p.kind as object));
    if (trProp) {
      expect(describeKind(trProp.kind, makeT("es"))).toMatch(/^Pago del fondo: [\d.]+ NEAR a \S+$/);
      expect(Object.keys(trProp)).toEqual(expect.arrayContaining(["id", "proposer", "description", "kind", "status", "vote_counts", "votes"]));
    }
  });
});
