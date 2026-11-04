"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import type { NearNetwork, Tx } from "@/lib/near";
import { useT } from "@/i18n/client";

type Ctx = {
  network: NearNetwork;
  account: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  /** Firma y envía una transacción. Devuelve null si salió bien, o el mensaje de error. */
  send: (tx: Tx) => Promise<string | null>;
};

export const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet requiere <WalletProvider>");
  return c;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error");

export function WalletProvider({ network, children }: { network: NearNetwork; children: ReactNode }) {
  const ref = useRef<NearConnector | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  // near-connect usa APIs del navegador: se carga solo en el cliente.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({ network });
      ref.current = c;
      c.on("wallet:signIn", (t) => alive && setAccount(t.accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => alive && setAccount(null));
      try {
        const { accounts } = await c.getConnectedWallet();
        if (alive) setAccount(accounts[0]?.accountId ?? null);
      } catch {
        /* sin sesión previa */
      }
    })();
    return () => {
      alive = false;
    };
  }, [network]);

  const connect = useCallback(async () => {
    try {
      await ref.current?.connect();
      return null;
    } catch (e) {
      return msg(e);
    }
  }, []);
  const disconnect = useCallback(async () => {
    await ref.current?.disconnect();
    setAccount(null);
  }, []);
  const send = useCallback(async (tx: Tx) => {
    try {
      const wallet = await ref.current!.wallet();
      await wallet.signAndSendTransaction(tx);
      return null;
    } catch (e) {
      return msg(e);
    }
  }, []);

  const value = useMemo(() => ({ network, account, connect, disconnect, send }), [network, account, connect, disconnect, send]);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function WalletButton() {
  const { account, connect, disconnect, network } = useWallet();
  const t = useT();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-500">{t("w.network")} <strong>{network}</strong></span>
      {account ? (
        <span>
          {t("w.wallet")} <strong>{account}</strong>{" "}
          <button className="underline" onClick={disconnect}>{t("w.signOut")}</button>
        </span>
      ) : (
        <button
          className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
          onClick={async () => setErr(await connect())}
        >
          {t("w.connect")}
        </button>
      )}
      {err && <span role="alert" className="text-red-600">{err}</span>}
    </div>
  );
}
