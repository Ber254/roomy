// Utilidades puras para mostrar propuestas de Sputnik DAO. Sin red ni wallet.
import { yoctoToNear } from "./near";
import { DAO_FACTORY } from "./sputnik";
import type { NearNetwork } from "./near";

export type ProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";

/** Forma aplanada que devuelve `get_proposals` (ProposalOutput + Proposal). */
export type ProposalOut = {
  id: number;
  proposer: string;
  description: string;
  kind: unknown;
  status: ProposalStatus;
  vote_counts: Record<string, [string | number, string | number, string | number]>; // el RPC los devuelve como números
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
};

/** Nombre de DAO válido derivado del nombre de la casa. */
export function slugifyDaoName(house: string): string {
  const s = house
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return s.length >= 2 ? s : `casa-${s || "roomy"}`.slice(0, 30);
}

export const daoAccountId = (name: string, network: NearNetwork) => `${name}.${DAO_FACTORY[network]}`;

/** Dominio permitido para un DAO de casa: subcuenta directa del factory de la red. */
export function isHouseDaoAccount(account: string, network: NearNetwork): boolean {
  const suffix = `.${DAO_FACTORY[network]}`;
  return account.endsWith(suffix) && /^[a-z\d]+([-_][a-z\d]+)*$/.test(account.slice(0, -suffix.length));
}

type Kind = Record<string, Record<string, string>> | string;

/** Texto legible de una propuesta según su tipo. */
export function describeKind(kind: unknown): string {
  if (kind === "Vote") return "Decisión de la casa";
  const k = kind as Kind;
  if (k && typeof k === "object") {
    if ("Transfer" in k) {
      const t = k.Transfer;
      return `Pago del fondo: ${yoctoToNear(t.amount)} NEAR a ${t.receiver_id}`;
    }
    if ("AddMemberToRole" in k) return `Agregar roomie: ${k.AddMemberToRole.member_id}`;
  }
  return "Otra propuesta";
}

export const STATUS_ES: Record<ProposalStatus, string> = {
  InProgress: "en votación",
  Approved: "aprobada",
  Rejected: "rechazada",
  Removed: "eliminada",
  Expired: "vencida",
  Moved: "movida",
  Failed: "falló al ejecutar",
};

/** [a favor, en contra, spam] sumando todos los roles. */
export function tally(p: Pick<ProposalOut, "vote_counts">): { yes: number; no: number; spam: number } {
  let yes = 0, no = 0, spam = 0;
  for (const [a, r, s] of Object.values(p.vote_counts ?? {})) {
    yes += Number(a); no += Number(r); spam += Number(s);
  }
  return { yes, no, spam };
}

export const myVote = (p: Pick<ProposalOut, "votes">, account: string | null) =>
  account ? p.votes?.[account] ?? null : null;

/** Puede votar: está en el consejo y todavía no votó esta propuesta en curso. */
export function canVote(p: ProposalOut, account: string | null, council: string[]): boolean {
  return !!account && p.status === "InProgress" && council.includes(account) && !myVote(p, account);
}

/** Saca el grupo del consejo de una política `get_policy`. */
export function councilOf(policy: { roles?: { name: string; kind: unknown }[] } | null): string[] {
  const role = policy?.roles?.find((r) => r.name === "council");
  const kind = role?.kind as { Group?: string[] } | undefined;
  return Array.isArray(kind?.Group) ? kind.Group : [];
}
