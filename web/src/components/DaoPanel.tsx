"use client";

import { useCallback, useEffect, useState } from "react";
import { nearToYocto, yoctoToNear, transferTx, type Tx } from "@/lib/near";
import {
  actProposalTx, addMemberProposalKind, addProposalTx, createDaoTx, DAO_FACTORY,
  DEFAULT_BOND_YOCTO, transferProposalKind, voteProposalKind,
} from "@/lib/sputnik";
import { canVote, daoAccountId, describeKind, myVote, slugifyDaoName, STATUS_ES, tally, type ProposalOut } from "@/lib/sputnik-ui";
import { useWallet } from "./WalletProvider";

type Member = { memberId: string; name: string; nearAccount: string | null; isHost: boolean };
type Chain = {
  dao: string | null; balanceYocto?: string; council?: string[]; bondYocto?: string | null;
  proposals?: ProposalOut[]; error?: string;
};

const btn = "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
const field = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const box = "space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800";

export default function DaoPanel(props: {
  houseId: string;
  houseName: string;
  isHost: boolean;
  members: Member[];
  /** depósito de creación del DAO, en NEAR (a confirmar contra el factory en testnet) */
  createDepositNear: string;
}) {
  const { houseId, houseName, isHost, members, createDepositNear } = props;
  const { account, network, send } = useWallet();
  const [chain, setChain] = useState<Chain | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formularios
  const [daoName, setDaoName] = useState(slugifyDaoName(houseName));
  const [deposit, setDeposit] = useState(createDepositNear);
  const [fund, setFund] = useState("");
  const [decision, setDecision] = useState("");
  const [payTo, setPayTo] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [payWhy, setPayWhy] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/dao/${houseId}`)
      .then((r) => r.json())
      .then((d) => alive && setChain(d))
      .catch((e) => alive && setChain({ dao: null, error: e instanceof Error ? e.message : "Error" }));
    return () => { alive = false; };
  }, [houseId, tick]);

  const dao = chain?.dao ?? null;
  const council = chain?.council ?? [];
  const bond = chain?.bondYocto ?? DEFAULT_BOND_YOCTO;
  const withNear = members.filter((m) => m.nearAccount);

  /** Ejecuta una acción con la wallet y refresca; los errores se muestran arriba. */
  const run = useCallback(async (build: () => Tx | Promise<Tx>, after?: () => Promise<string | null>) => {
    setError(null);
    setBusy(true);
    try {
      const err = await send(await build());
      if (err) return setError(err);
      if (after) {
        const e2 = await after();
        if (e2) return setError(e2);
      }
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [send]);

  const register = async (account: string) => {
    const res = await fetch("/api/dao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ houseId, daoAccount: account }),
    });
    const data = await res.json();
    return res.ok ? null : (data.error as string);
  };

  const yocto = (v: string, label: string) => {
    const y = nearToYocto(v);
    if (!y) setError(`${label}: monto inválido (ej: 1.5)`);
    return y;
  };

  // ---------- sin DAO ----------
  if (chain && !dao) {
    const hostNear = members.find((m) => m.isHost)?.nearAccount ?? null;
    const target = daoAccountId(daoName, network);
    return (
      <div className={box}>
        {!isHost ? (
          <p className="text-sm text-zinc-500">El hospedante todavía no creó el DAO de la casa (fondo común y votaciones).</p>
        ) : !hostNear ? (
          <p className="text-sm text-zinc-500">Configurá tu cuenta NEAR arriba para poder crear el DAO.</p>
        ) : (
          <>
            <p className="text-sm">
              Crear el DAO de la casa en <strong>Sputnik</strong>: los roomies con cuenta NEAR (<strong>{withNear.length}</strong> de {members.length}) serán el
              consejo y decidirán por mayoría simple.
            </p>
            <div className="flex flex-wrap gap-2">
              <input className={field} value={daoName} onChange={(e) => setDaoName(e.target.value.toLowerCase())} aria-label="Nombre del DAO" />
              <input className={field} value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-label="Depósito de creación en NEAR" />
            </div>
            <p className="text-xs text-zinc-500">
              Se creará <code>{target}</code>. El depósito de creación (NEAR) es un valor a confirmar contra el factory <code>{DAO_FACTORY[network]}</code>.
              {withNear.length < members.length && " Los roomies sin cuenta NEAR se agregan después con una propuesta."}
            </p>
            <button
              className={btn}
              disabled={busy || !account}
              onClick={() => {
                if (account !== hostNear) return setError(`Conectá la wallet ${hostNear} (la del hospedante)`);
                const dep = yocto(deposit, "Depósito");
                if (!dep) return;
                run(
                  () => createDaoTx(DAO_FACTORY[network], daoName, houseName, withNear.map((m) => m.nearAccount!), dep),
                  () => register(target),
                );
              }}
            >
              Crear DAO
            </button>
            {!account && <p className="text-xs text-zinc-500">Conectá tu wallet para continuar.</p>}
            {error?.includes("registr") || error?.includes("verificar") ? (
              <button className="text-sm underline" onClick={async () => { const e = await register(target); if (e) setError(e); else setTick((t) => t + 1); }}>
                Reintentar registro del DAO
              </button>
            ) : null}
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (!chain) return <p className="text-sm text-zinc-500">Cargando…</p>;

  // ---------- con DAO ----------
  const inCouncil = !!account && council.includes(account);
  const notInCouncil = withNear.filter((m) => !council.includes(m.nearAccount!));
  const propose = (desc: string, kind: Parameters<typeof addProposalTx>[2], reset?: () => void) =>
    run(() => addProposalTx(dao!, desc, kind, bond), async () => { reset?.(); return null; });

  return (
    <div className="space-y-4">
      {chain.error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{chain.error}</p>}
      {error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>}

      <div className={box}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-zinc-500">DAO <code>{dao}</code></span>
          <span>Fondo común: <strong>{chain.balanceYocto ? yoctoToNear(chain.balanceYocto) : "—"} NEAR</strong></span>
        </div>
        <p className="text-xs text-zinc-500">Consejo ({council.length}): {council.join(", ") || "—"}</p>
        <div className="flex gap-2">
          <input className={field} placeholder="Aportar al fondo (NEAR)" value={fund} onChange={(e) => setFund(e.target.value)} />
          <button className={btn} disabled={busy || !account} onClick={() => { const y = yocto(fund, "Aporte"); if (y) run(() => transferTx(dao!, y), async () => { setFund(""); return null; }); }}>
            Aportar
          </button>
        </div>
      </div>

      <div className={box}>
        <h3 className="font-medium">Nueva decisión de la casa</h3>
        <div className="flex gap-2">
          <input className={field} placeholder="Ej: ¿Compramos un aspirador compartido?" value={decision} onChange={(e) => setDecision(e.target.value)} maxLength={300} />
          <button className={btn} disabled={busy || !account || !decision.trim()} onClick={() => propose(decision.trim(), voteProposalKind(), () => setDecision(""))}>
            Proponer
          </button>
        </div>
        <h3 className="pt-2 font-medium">Pedir un pago del fondo</h3>
        <div className="flex flex-wrap gap-2">
          <select className={field} value={payTo} onChange={(e) => setPayTo(e.target.value)} aria-label="Destinatario">
            <option value="">Destinatario…</option>
            {withNear.map((m) => <option key={m.memberId} value={m.nearAccount!}>{m.name} ({m.nearAccount})</option>)}
          </select>
          <input className={field} placeholder="Monto (NEAR)" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
          <input className={field} placeholder="Motivo (ej: reparación del termotanque)" value={payWhy} onChange={(e) => setPayWhy(e.target.value)} maxLength={300} />
          <button
            className={btn}
            disabled={busy || !account || !payTo || !payWhy.trim()}
            onClick={() => { const y = yocto(payAmt, "Pago"); if (y) propose(payWhy.trim(), transferProposalKind(payTo, y), () => { setPayAmt(""); setPayWhy(""); }); }}
          >
            Pedir pago
          </button>
        </div>
        {notInCouncil.length > 0 && (
          <div className="pt-2 text-sm">
            <span className="text-zinc-500">Todavía fuera del consejo: </span>
            {notInCouncil.map((m) => (
              <button key={m.memberId} className="mr-2 underline" disabled={busy || !account}
                onClick={() => propose(`Agregar a ${m.name} al consejo`, addMemberProposalKind(m.nearAccount!))}>
                Proponer a {m.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Cada propuesta requiere un bond de {yoctoToNear(bond)} NEAR: se devuelve al aprobarse o rechazarse, no si la marcan como spam.
        </p>
        {!account && <p className="text-xs text-zinc-500">Conectá tu wallet para proponer y votar.</p>}
        {account && !inCouncil && <p className="text-xs text-zinc-500">Tu wallet ({account}) no está en el consejo: podés proponer, pero no votar.</p>}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Propuestas</h3>
        {(chain.proposals ?? []).length === 0 && <p className="text-sm text-zinc-500">Todavía no hay propuestas.</p>}
        {(chain.proposals ?? []).map((p) => {
          const t = tally(p);
          const mine = myVote(p, account);
          return (
            <div key={p.id} className={box}>
              <div className="flex justify-between gap-2">
                <strong>{p.description}</strong>
                <span className="shrink-0 text-sm text-zinc-500">{STATUS_ES[p.status]}</span>
              </div>
              <p className="text-xs text-zinc-500">{describeKind(p.kind)} · propone {p.proposer}</p>
              <p className="text-sm">A favor <strong>{t.yes}</strong> · En contra <strong>{t.no}</strong>{mine && <> · tu voto: {mine === "Approve" ? "a favor" : mine === "Reject" ? "en contra" : "spam"}</>}</p>
              {canVote(p, account, council) && (
                <div className="flex gap-2">
                  <button className={btn} disabled={busy} onClick={() => run(() => actProposalTx(dao!, p.id, "VoteApprove", p.kind as never))}>A favor</button>
                  <button className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm" disabled={busy} onClick={() => run(() => actProposalTx(dao!, p.id, "VoteReject", p.kind as never))}>En contra</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
