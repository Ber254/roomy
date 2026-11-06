"use client";

import { useCallback, useEffect, useState } from "react";
import { contractCall, guaranteeId, GAS_PAYOUT, nearToYocto, yoctoToNear, type Tx } from "@/lib/near";
import { useI18n } from "@/i18n/client";
import type { Key } from "@/i18n";
import { useWallet } from "./WalletProvider";

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

export default function GuaranteePanel(props: {
  houseId: string;
  escrow: string;
  tenants: Tenant[];
  host: { name: string; nearAccount: string | null } | null;
}) {
  const { houseId, escrow, tenants, host } = props;
  const t = useI18n().t;
  const { account, send } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // fuerza recarga del estado on-chain

  const run = useCallback(
    async (tx: Tx) => {
      setError(null);
      const err = await send(tx);
      if (err) setError(err);
      else {
        setTick((n) => n + 1);
        // la wallet responde antes de que la cadena refleje la transacción: se vuelve a leer unos segundos después
        setTimeout(() => setTick((n) => n + 1), 4000);
        setTimeout(() => setTick((n) => n + 1), 10000);
      }
    },
    [send],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t("g.contract")} <code>{escrow}</code></p>
      {!host?.nearAccount && (
        <p className="rounded-md bg-amber-100 p-2 text-sm text-amber-900">{t("g.hostNoNear")}</p>
      )}
      {error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>}
      {tenants.length === 0 && <p className="text-sm text-zinc-500">{t("g.noTenants")}</p>}
      {tenants.map((tn) => (
        <Card key={tn.memberId} {...{ houseId, escrow, tn, host, account, tick }} send={run} />
      ))}
    </div>
  );
}

function Card({ houseId, escrow, tn, host, account, send, tick }: {
  houseId: string; escrow: string; tn: Tenant; host: { name: string; nearAccount: string | null } | null;
  account: string | null; send: (tx: Tx) => Promise<void>; tick: number;
}) {
  const t = useI18n().t;
  const id = guaranteeId(houseId, tn.memberId);
  const [chain, setChain] = useState<Chain | null>(null);
  const [amount, setAmount] = useState("");
  const [toG, setToG] = useState("");
  const [toL, setToL] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/guarantees/${houseId}/${tn.memberId}`)
      .then((r) => r.json())
      .then((d) => alive && setChain(d))
      .catch((e) => alive && setChain({ deployed: true, guarantee: null, settlement: null, agreement: null, error: msg(e) }));
    return () => { alive = false; };
  }, [houseId, tn.memberId, tick]);

  const g = chain?.guarantee ?? null;
  const call = (method: string, args: Record<string, unknown>, o: { depositYocto?: string; gas?: string } = {}) =>
    send(contractCall(escrow, method, args, o));
  const yocto = (v: string) => { const y = nearToYocto(v); if (!y) setLocal(t("g.badAmount")); else setLocal(null); return y; };

  const isGuarantor = !!g && account === g.guarantor;
  const isLandlord = !!g && account === g.landlord;
  const isParty = isGuarantor || isLandlord;
  const statusLabel = g ? t(`g.status.${g.status}` as Key) : t("g.status.none");

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex justify-between">
        <strong>{tn.name}</strong>
        <span className="text-sm text-zinc-500">{statusLabel}</span>
      </div>
      {chain?.error && <p className="text-sm text-red-600">{chain.error}</p>}

      {!g && !chain?.error && (
        tn.nearAccount && host?.nearAccount ? (
          account === tn.nearAccount ? (
            <div className="flex gap-2">
              <input className={field} placeholder={t("g.amountPh")} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className={btn} onClick={() => {
                const y = yocto(amount);
                if (y) call("create_guarantee", { id, landlord: host.nearAccount, amount: y, end_date_ns: null });
              }}>{t("g.create")}</button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t("g.mustConnect", { name: tn.name, account: tn.nearAccount })}</p>
          )
        ) : (
          <p className="text-sm text-zinc-500">{t("g.missingAccounts", { name: tn.name })}</p>
        )
      )}

      {g && (
        <>
          <p className="text-sm">
            {t("g.agreed", { amount: yoctoToNear(g.amount), locked: yoctoToNear(g.locked) })}
            <span className="block text-xs text-zinc-500">{t("g.parties", { guarantor: g.guarantor, landlord: g.landlord })}</span>
          </p>

          {g.status === "Pending" && (
            <div className="flex gap-2">
              {isGuarantor && (
                <button className={btn} onClick={() => call("fund_guarantee", { id }, { depositYocto: g.amount })}>
                  {t("g.fund", { amount: yoctoToNear(g.amount) })}
                </button>
              )}
              {isParty && <button className="text-sm underline" onClick={() => call("cancel_guarantee", { id })}>{t("g.cancel")}</button>}
            </div>
          )}

          {g.status === "Active" && (
            <div className="space-y-2">
              {chain?.agreement && (
                <div className="rounded-md bg-emerald-50 p-2 text-sm dark:bg-emerald-950">
                  {t("g.agreementReady", { a: yoctoToNear(chain.agreement.to_guarantor), l: yoctoToNear(chain.agreement.to_landlord) })}{" "}
                  <button className={btn} disabled={!account} onClick={() => call("execute_settlement", { id }, { gas: GAS_PAYOUT })}>{t("g.execute")}</button>
                </div>
              )}
              {chain?.settlement && !chain.agreement && (
                <div className="rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800">
                  {t("g.proposal", { proposer: chain.settlement.proposer, a: yoctoToNear(chain.settlement.to_guarantor), l: yoctoToNear(chain.settlement.to_landlord) })}
                  {isParty && account !== chain.settlement.proposer && (
                    <span className="ml-2 inline-flex gap-2">
                      <button className={btn} onClick={() => call("accept_settlement", { id })}>{t("g.accept")}</button>
                      <button className="underline" onClick={() => call("reject_settlement", { id })}>{t("g.reject")}</button>
                    </span>
                  )}
                  {isParty && account === chain.settlement.proposer && (
                    <button className="ml-2 underline" onClick={() => call("reject_settlement", { id })}>{t("g.withdraw")}</button>
                  )}
                </div>
              )}
              {isParty && !chain?.agreement && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">{t("g.proposeHelp")}</p>
                  <div className="flex gap-2">
                    <input className={field} placeholder={t("g.toTenant")} value={toG} onChange={(e) => setToG(e.target.value)} />
                    <input className={field} placeholder={t("g.toLandlord")} value={toL} onChange={(e) => setToL(e.target.value)} />
                    <button className={btn} onClick={() => {
                      const a = toG.trim() ? yocto(toG) : "0";
                      const b = toL.trim() ? yocto(toL) : "0";
                      if (a && b) call("propose_settlement", { id, to_guarantor: a, to_landlord: b });
                    }}>{t("g.propose")}</button>
                  </div>
                </div>
              )}
              {isLandlord && (
                <div className="flex gap-2">
                  <input className={field} placeholder={t("g.returnPh")} value={toG} onChange={(e) => setToG(e.target.value)} />
                  <button className={btn} onClick={() => {
                    const y = yocto(toG);
                    if (y) call("return_to_guarantor", { id, amount: y }, { gas: GAS_PAYOUT });
                  }}>{t("g.return")}</button>
                </div>
              )}
              {!account && <p className="text-xs text-zinc-500">{t("g.connectToAct")}</p>}
              {account && !isParty && <p className="text-xs text-zinc-500">{t("g.notParty", { account })}</p>}
            </div>
          )}
        </>
      )}
      {local && <p className="text-sm text-red-600">{local}</p>}
    </div>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error");
