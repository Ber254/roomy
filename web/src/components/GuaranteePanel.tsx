"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { contractCall, guaranteeId, GAS_PAYOUT, nearToYocto, yoctoToNear, type NearNetwork } from "@/lib/near";

type Tenant = { memberId: string; name: string; nearAccount: string | null };
type G = {
  guarantor: string; landlord: string; amount: string; locked: string; funded: string;
  status: "Pending" | "Active" | "Closed" | "Cancelled";
};
type S = { proposer: string; to_guarantor: string; to_landlord: string };
type A = { to_guarantor: string; to_landlord: string };
type Chain = { deployed: boolean; guarantee: G | null; settlement: S | null; agreement: A | null; error?: string };

const btn = "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
const field = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const STATUS_ES = { Pending: "pendiente de fondeo", Active: "activa", Closed: "cerrada", Cancelled: "cancelada" } as const;

export default function GuaranteePanel(props: {
  houseId: string;
  escrow: string;
  network: NearNetwork;
  tenants: Tenant[];
  host: { name: string; nearAccount: string | null } | null;
}) {
  const { houseId, escrow, network, tenants, host } = props;
  const connectorRef = useRef<NearConnector | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // fuerza recarga del estado on-chain

  // near-connect usa APIs del navegador: se carga solo en el cliente.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({ network });
      connectorRef.current = c;
      c.on("wallet:signIn", (t) => alive && setAccount(t.accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => alive && setAccount(null));
      try {
        const { accounts } = await c.getConnectedWallet();
        if (alive) setAccount(accounts[0]?.accountId ?? null);
      } catch {
        /* sin sesión previa */
      }
    })();
    return () => { alive = false; };
  }, [network]);

  const connect = async () => {
    setError(null);
    try { await connectorRef.current?.connect(); } catch (e) { setError(msg(e)); }
  };
  const disconnect = async () => { await connectorRef.current?.disconnect(); setAccount(null); };

  const send = useCallback(async (tx: ReturnType<typeof contractCall>) => {
    setError(null);
    try {
      const wallet = await connectorRef.current!.wallet();
      await wallet.signAndSendTransaction(tx);
      setTick((t) => t + 1);
    } catch (e) { setError(msg(e)); }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-zinc-500">Red: <strong>{network}</strong> · Contrato: <code>{escrow}</code></span>
        {account ? (
          <span>Wallet: <strong>{account}</strong> <button className="underline" onClick={disconnect}>salir</button></span>
        ) : (
          <button className={btn} onClick={connect}>Conectar wallet NEAR</button>
        )}
      </div>
      {!host?.nearAccount && (
        <p className="rounded-md bg-amber-100 p-2 text-sm text-amber-900">
          El hospedante todavía no configuró su cuenta NEAR: sin ella no se pueden crear garantías.
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>}
      {tenants.length === 0 && <p className="text-sm text-zinc-500">No hay inquilinos todavía.</p>}
      {tenants.map((t) => (
        <Card key={t.memberId} {...{ houseId, escrow, t, host, account, send, tick }} />
      ))}
    </div>
  );
}

function Card({ houseId, escrow, t, host, account, send, tick }: {
  houseId: string; escrow: string; t: Tenant; host: { name: string; nearAccount: string | null } | null;
  account: string | null; send: (tx: ReturnType<typeof contractCall>) => Promise<void>; tick: number;
}) {
  const id = guaranteeId(houseId, t.memberId);
  const [chain, setChain] = useState<Chain | null>(null);
  const [amount, setAmount] = useState("");
  const [toG, setToG] = useState("");
  const [toL, setToL] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/guarantees/${houseId}/${t.memberId}`)
      .then((r) => r.json())
      .then((d) => alive && setChain(d))
      .catch((e) => alive && setChain({ deployed: true, guarantee: null, settlement: null, agreement: null, error: msg(e) }));
    return () => { alive = false; };
  }, [houseId, t.memberId, tick]);

  const g = chain?.guarantee ?? null;
  const call = (method: string, args: Record<string, unknown>, o: { depositYocto?: string; gas?: string } = {}) =>
    send(contractCall(escrow, method, args, o));
  const yocto = (v: string) => { const y = nearToYocto(v); if (!y) setLocal("Monto inválido (ej: 1.5)"); else setLocal(null); return y; };

  const isGuarantor = !!g && account === g.guarantor;
  const isLandlord = !!g && account === g.landlord;
  const isParty = isGuarantor || isLandlord;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex justify-between">
        <strong>{t.name}</strong>
        <span className="text-sm text-zinc-500">{g ? STATUS_ES[g.status] : "sin garantía"}</span>
      </div>
      {chain?.error && <p className="text-sm text-red-600">{chain.error}</p>}

      {!g && !chain?.error && (
        t.nearAccount && host?.nearAccount ? (
          account === t.nearAccount ? (
            <div className="flex gap-2">
              <input className={field} placeholder="Monto en NEAR (ej: 5)" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className={btn} onClick={() => {
                const y = yocto(amount);
                if (y) call("create_guarantee", { id, landlord: host.nearAccount, amount: y, end_date_ns: null });
              }}>Crear</button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t.name} debe crearla conectando <code>{t.nearAccount}</code>.</p>
          )
        ) : (
          <p className="text-sm text-zinc-500">Faltan las cuentas NEAR de {t.name} y del hospedante.</p>
        )
      )}

      {g && (
        <>
          <p className="text-sm">
            Acordado <strong>{yoctoToNear(g.amount)} NEAR</strong> · bloqueado <strong>{yoctoToNear(g.locked)} NEAR</strong>
            <span className="block text-xs text-zinc-500">garante {g.guarantor} → arrendador {g.landlord}</span>
          </p>

          {g.status === "Pending" && (
            <div className="flex gap-2">
              {isGuarantor && (
                <button className={btn} onClick={() => call("fund_guarantee", { id }, { depositYocto: g.amount })}>
                  Fondear {yoctoToNear(g.amount)} NEAR
                </button>
              )}
              {isParty && <button className="text-sm underline" onClick={() => call("cancel_guarantee", { id })}>Cancelar</button>}
            </div>
          )}

          {g.status === "Active" && (
            <div className="space-y-2">
              {chain?.agreement && (
                <div className="rounded-md bg-emerald-50 p-2 text-sm dark:bg-emerald-950">
                  Acuerdo firmado por ambas partes: inquilino {yoctoToNear(chain.agreement.to_guarantor)} · arrendador {yoctoToNear(chain.agreement.to_landlord)} NEAR.{" "}
                  <button className={btn} disabled={!account} onClick={() => call("execute_settlement", { id }, { gas: GAS_PAYOUT })}>Ejecutar pago</button>
                </div>
              )}
              {chain?.settlement && !chain.agreement && (
                <div className="rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800">
                  Propuesta de {chain.settlement.proposer}: inquilino {yoctoToNear(chain.settlement.to_guarantor)} · arrendador {yoctoToNear(chain.settlement.to_landlord)} NEAR.
                  {isParty && account !== chain.settlement.proposer && (
                    <span className="ml-2 inline-flex gap-2">
                      <button className={btn} onClick={() => call("accept_settlement", { id })}>Aceptar</button>
                      <button className="underline" onClick={() => call("reject_settlement", { id })}>Rechazar</button>
                    </span>
                  )}
                  {isParty && account === chain.settlement.proposer && (
                    <button className="ml-2 underline" onClick={() => call("reject_settlement", { id })}>Retirar</button>
                  )}
                </div>
              )}
              {isParty && !chain?.agreement && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Proponer reparto del saldo bloqueado (lo que no repartas sigue bloqueado). El fee de 0.05% se descuenta solo de lo que vuelve al inquilino.</p>
                  <div className="flex gap-2">
                    <input className={field} placeholder="Para inquilino (NEAR)" value={toG} onChange={(e) => setToG(e.target.value)} />
                    <input className={field} placeholder="Para arrendador (NEAR)" value={toL} onChange={(e) => setToL(e.target.value)} />
                    <button className={btn} onClick={() => {
                      const a = toG.trim() ? yocto(toG) : "0";
                      const b = toL.trim() ? yocto(toL) : "0";
                      if (a && b) call("propose_settlement", { id, to_guarantor: a, to_landlord: b });
                    }}>Proponer</button>
                  </div>
                </div>
              )}
              {isLandlord && (
                <div className="flex gap-2">
                  <input className={field} placeholder="Devolver sin negociar (NEAR)" value={toG} onChange={(e) => setToG(e.target.value)} />
                  <button className={btn} onClick={() => {
                    const y = yocto(toG);
                    if (y) call("return_to_guarantor", { id, amount: y }, { gas: GAS_PAYOUT });
                  }}>Devolver</button>
                </div>
              )}
              {!account && <p className="text-xs text-zinc-500">Conectá tu wallet para actuar.</p>}
              {account && !isParty && <p className="text-xs text-zinc-500">Tu wallet ({account}) no es parte de esta garantía.</p>}
            </div>
          )}
        </>
      )}
      {local && <p className="text-sm text-red-600">{local}</p>}
    </div>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error");
