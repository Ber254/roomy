"use client";

import { useCallback, useEffect, useState } from "react";
import { nearToYocto, yoctoToNear, transferTx, type Tx } from "@/lib/near";
import {
  actProposalTx, addMemberProposalKind, addProposalTx, createDaoTx, DAO_FACTORY,
  DEFAULT_BOND_YOCTO, transferProposalKind, voteProposalKind,
} from "@/lib/sputnik";
import { canVote, daoAccountId, describeKind, myVote, slugifyDaoName, statusKey, tally, type ProposalOut } from "@/lib/sputnik-ui";
import { useI18n } from "@/i18n/client";
import type { Key } from "@/i18n";
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
  /** depósito de creación del DAO, en NEAR (mínimo práctico ~5.5, verificado con DAOs reales en testnet) */
  createDepositNear: string;
}) {
  const { houseId, houseName, isHost, members, createDepositNear } = props;
  const t = useI18n().t;
  const { account, network, send } = useWallet();
  const [chain, setChain] = useState<Chain | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // true si el DAO se creó on-chain pero falló registrarlo en la casa: permite reintentar sin volver a pagar
  const [needRegister, setNeedRegister] = useState(false);

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
      setTick((n) => n + 1);
      // la wallet responde antes de que la cadena refleje la transacción: se vuelve a leer unos segundos después
      setTimeout(() => setTick((n) => n + 1), 4000);
      setTimeout(() => setTick((n) => n + 1), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [send]);

  const register = async (acct: string) => {
    const res = await fetch("/api/dao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ houseId, daoAccount: acct }),
    });
    const data = await res.json();
    return res.ok ? null : (data.error as string);
  };

  const yocto = (v: string, labelKey: Key) => {
    const y = nearToYocto(v);
    if (!y) setError(t("d.badAmount", { label: t(labelKey) }));
    return y;
  };

  // ---------- sin DAO ----------
  if (chain && !dao) {
    const hostNear = members.find((m) => m.isHost)?.nearAccount ?? null;
    const target = daoAccountId(daoName, network);
    return (
      <div className={box}>
        {!isHost ? (
          <p className="text-sm text-zinc-500">{t("d.noHostYet")}</p>
        ) : !hostNear ? (
          <p className="text-sm text-zinc-500">{t("d.setNearFirst")}</p>
        ) : (
          <>
            <p className="text-sm">{t("d.createIntro", { with: withNear.length, total: members.length })}</p>
            <div className="flex flex-wrap gap-2">
              <input className={field} value={daoName} onChange={(e) => setDaoName(e.target.value.toLowerCase())} aria-label={t("d.nameAria")} />
              <input className={field} value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-label={t("d.depositAria")} />
            </div>
            <p className="text-xs text-zinc-500">
              {t("d.willCreate", { account: target, factory: DAO_FACTORY[network] })}
              {withNear.length < members.length && ` ${t("d.missingNearNote")}`}
            </p>
            <button
              className={btn}
              disabled={busy || !account}
              onClick={() => {
                if (account !== hostNear) return setError(t("d.wrongWallet", { account: hostNear }));
                const dep = yocto(deposit, "d.lbl.deposit");
                if (!dep) return;
                run(
                  () => createDaoTx(DAO_FACTORY[network], daoName, houseName, withNear.map((m) => m.nearAccount!), dep),
                  async () => {
                    const e = await register(target);
                    setNeedRegister(!!e);
                    return e;
                  },
                );
              }}
            >
              {t("d.createBtn")}
            </button>
            {!account && <p className="text-xs text-zinc-500">{t("d.connectToContinue")}</p>}
            {needRegister && (
              <button className="text-sm underline" onClick={async () => { const e = await register(target); if (e) setError(e); else { setNeedRegister(false); setError(null); setTick((n) => n + 1); } }}>
                {t("d.retryRegister")}
              </button>
            )}
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (!chain) return <p className="text-sm text-zinc-500">{t("d.loading")}</p>;

  // ---------- con DAO ----------
  const inCouncil = !!account && council.includes(account);
  const notInCouncil = withNear.filter((m) => !council.includes(m.nearAccount!));
  const propose = (desc: string, kind: Parameters<typeof addProposalTx>[2], reset?: () => void) =>
    run(() => addProposalTx(dao!, desc, kind, bond), async () => { reset?.(); return null; });
  const voteLabel = (v: "Approve" | "Reject" | "Remove") => t(v === "Approve" ? "d.v.approve" : v === "Reject" ? "d.v.reject" : "d.v.remove");

  return (
    <div className="space-y-4">
      {chain.error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{chain.error}</p>}
      {error && <p role="alert" className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>}

      <div className={box}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-zinc-500">DAO <code>{dao}</code></span>
          <span>{t("d.fund", { amount: chain.balanceYocto ? yoctoToNear(chain.balanceYocto) : "—" })}</span>
        </div>
        <p className="text-xs text-zinc-500">{t("d.council", { n: council.length, list: council.join(", ") || "—" })}</p>
        <div className="flex gap-2">
          <input className={field} placeholder={t("d.contribPh")} value={fund} onChange={(e) => setFund(e.target.value)} />
          <button className={btn} disabled={busy || !account} onClick={() => { const y = yocto(fund, "d.lbl.contribution"); if (y) run(() => transferTx(dao!, y), async () => { setFund(""); return null; }); }}>
            {t("d.contribBtn")}
          </button>
        </div>
      </div>

      <div className={box}>
        <h3 className="font-medium">{t("d.newDecision")}</h3>
        <div className="flex gap-2">
          <input className={field} placeholder={t("d.decisionPh")} value={decision} onChange={(e) => setDecision(e.target.value)} maxLength={300} />
          <button className={btn} disabled={busy || !account || !decision.trim()} onClick={() => propose(decision.trim(), voteProposalKind(), () => setDecision(""))}>
            {t("d.proposeBtn")}
          </button>
        </div>
        <h3 className="pt-2 font-medium">{t("d.requestPayment")}</h3>
        <div className="flex flex-wrap gap-2">
          <select className={field} value={payTo} onChange={(e) => setPayTo(e.target.value)} aria-label={t("d.recipientAria")}>
            <option value="">{t("d.recipient")}</option>
            {withNear.map((m) => <option key={m.memberId} value={m.nearAccount!}>{m.name} ({m.nearAccount})</option>)}
          </select>
          <input className={field} placeholder={t("d.amountPh")} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
          <input className={field} placeholder={t("d.reasonPh")} value={payWhy} onChange={(e) => setPayWhy(e.target.value)} maxLength={300} />
          <button
            className={btn}
            disabled={busy || !account || !payTo || !payWhy.trim()}
            onClick={() => { const y = yocto(payAmt, "d.lbl.payment"); if (y) propose(payWhy.trim(), transferProposalKind(payTo, y), () => { setPayAmt(""); setPayWhy(""); }); }}
          >
            {t("d.requestBtn")}
          </button>
        </div>
        {notInCouncil.length > 0 && (
          <div className="pt-2 text-sm">
            <span className="text-zinc-500">{t("d.outside")} </span>
            {notInCouncil.map((m) => (
              <button key={m.memberId} className="mr-2 underline" disabled={busy || !account}
                onClick={() => propose(t("d.addMemberDesc", { name: m.name }), addMemberProposalKind(m.nearAccount!))}>
                {t("d.proposeMember", { name: m.name })}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500">{t("d.bondNote", { bond: yoctoToNear(bond) })}</p>
        {!account && <p className="text-xs text-zinc-500">{t("d.connectToVote")}</p>}
        {account && !inCouncil && <p className="text-xs text-zinc-500">{t("d.notCouncil", { account })}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">{t("d.proposals")}</h3>
        {(chain.proposals ?? []).length === 0 && <p className="text-sm text-zinc-500">{t("d.noProposals")}</p>}
        {(chain.proposals ?? []).map((p) => {
          const tl = tally(p);
          const mine = myVote(p, account);
          return (
            <div key={p.id} className={box}>
              <div className="flex justify-between gap-2">
                <strong>{p.description}</strong>
                <span className="shrink-0 text-sm text-zinc-500">{t(statusKey(p.status))}</span>
              </div>
              <p className="text-xs text-zinc-500">{describeKind(p.kind, t)} · {t("d.proposedBy", { name: p.proposer })}</p>
              <p className="text-sm">{t("d.votesLine", { yes: tl.yes, no: tl.no })}{mine && <> · {t("d.yourVote", { vote: voteLabel(mine) })}</>}</p>
              {canVote(p, account, council) && (
                <div className="flex gap-2">
                  <button className={btn} disabled={busy} onClick={() => run(() => actProposalTx(dao!, p.id, "VoteApprove", p.kind as never))}>{t("d.voteFor")}</button>
                  <button className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm" disabled={busy} onClick={() => run(() => actProposalTx(dao!, p.id, "VoteReject", p.kind as never))}>{t("d.voteAgainst")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
