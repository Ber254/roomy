// Constructores de transacciones para Sputnik DAO v2 (near-daos/sputnik-dao-contract).
// Formatos verificados contra el código fuente del contrato (proposals.rs, policy.rs, factory lib.rs).
// Cada casa puede tener un DAO cuyos miembros (consejo) son los roomies:
//   - propuestas `Vote`: decisiones de la casa (reglas, compras) sin ejecución;
//   - propuestas `Transfer`: pagos desde el fondo común del DAO;
//   - propuestas `AddMemberToRole`: incorporar a un roomie que llegó después.

import { contractCall, GAS_DEFAULT } from "./near";

export const DAO_FACTORY = {
  mainnet: "sputnik-dao.near",
  testnet: "sputnikv2.testnet",
} as const;

/** Bond por propuesta. El default del contrato es 1 NEAR: demasiado para decisiones de piso. */
export const DEFAULT_BOND_YOCTO = "100000000000000000000000"; // 0.1 NEAR
const WEEK_NS = String(7 * 24 * 60 * 60 * 1_000_000_000);

export type ProposalKind =
  | "Vote"
  | { Transfer: { token_id: string; receiver_id: string; amount: string; msg: null } }
  | { AddMemberToRole: { member_id: string; role: string } };

export type VoteAction = "VoteApprove" | "VoteReject" | "VoteRemove" | "Finalize";

/** Política propia: cualquiera propone, el consejo (roomies) vota y decide por mayoría simple. */
export function housePolicy(members: string[], bondYocto = DEFAULT_BOND_YOCTO) {
  if (members.length === 0) throw new Error("El DAO necesita al menos un miembro");
  const uniq = [...new Set(members)];
  return {
    roles: [
      { name: "all", kind: "Everyone", permissions: ["*:AddProposal"], vote_policy: {} },
      {
        name: "council",
        kind: { Group: uniq },
        permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"],
        vote_policy: {},
      },
    ],
    default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
    proposal_bond: bondYocto,
    proposal_period: WEEK_NS,
    bounty_bond: bondYocto,
    bounty_forgiveness_period: String(24 * 60 * 60 * 1_000_000_000),
  };
}

/**
 * Crea el DAO de la casa como subcuenta del factory (`<name>.sputnikv2.testnet`).
 * `depositYocto` es el costo de creación. Verificado en testnet (2026-11-04): los DAOs reales ocupan ~543 KB
 * (~5.4 NEAR de almacenamiento bloqueado, el código se copia en cada cuenta), así que el mínimo práctico es ~5.5 NEAR;
 * el saldo restante queda como fondo inicial. El mínimo que valida el factory (0.01 NEAR) no alcanza para mantener la cuenta.
 */
export function createDaoTx(
  factory: string,
  name: string,
  houseName: string,
  members: string[],
  depositYocto: string,
) {
  if (!/^[a-z\d]+([-_][a-z\d]+)*$/.test(name) || name.length < 2 || name.length > 40) {
    throw new Error("Nombre de DAO inválido (minúsculas, números, - o _)");
  }
  const args = {
    config: { name, purpose: `Casa ${houseName}: fondo común y decisiones (Roomy)`, metadata: "" },
    policy: housePolicy(members),
  };
  const b64 = Buffer.from(JSON.stringify(args)).toString("base64");
  return contractCall(factory, "create", { name, args: b64 }, { depositYocto, gas: "150000000000000" });
}

export function addProposalTx(dao: string, description: string, kind: ProposalKind, bondYocto = DEFAULT_BOND_YOCTO) {
  if (!description.trim() || description.length > 500) throw new Error("Descripción inválida");
  return contractCall(dao, "add_proposal", { proposal: { description, kind } }, { depositYocto: bondYocto, gas: GAS_DEFAULT });
}

export const voteProposalKind = (): ProposalKind => "Vote";

export const transferProposalKind = (receiver: string, amountYocto: string): ProposalKind => ({
  Transfer: { token_id: "", receiver_id: receiver, amount: amountYocto, msg: null },
});

export const addMemberProposalKind = (member: string): ProposalKind => ({
  AddMemberToRole: { member_id: member, role: "council" },
});

/** El contrato exige reenviar el `kind` de la propuesta para validar que se actúa sobre la correcta. */
export function actProposalTx(dao: string, id: number, action: VoteAction, kind: ProposalKind) {
  if (!Number.isInteger(id) || id < 0) throw new Error("Id de propuesta inválido");
  return contractCall(dao, "act_proposal", { id, action, proposal: kind, memo: null }, { gas: "150000000000000" });
}
