"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Key } from "@/i18n";

export type TokenOption = { assetId: string; label: string };

type Quote = {
  amountInFormatted: string;
  amountOutFormatted: string;
  timeEstimate: number;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
};
type Payment = {
  id: string;
  status: "pending" | "processing" | "settled" | "failed" | "refunded";
  depositAddress: string | null;
  txHash: string | null;
  deadline: string | null;
  originSymbol: string | null;
  quote?: { quote: Quote } | null;
};

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const primary = "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";

export default function PayButton(props: {
  houseId: string;
  toMemberId: string;
  toName: string;
  amountLabel: string;
  tokens: TokenOption[];
  toHasNear: boolean;
  existing: Payment | null;
}) {
  const { houseId, toMemberId, toName, amountLabel, tokens, toHasNear, existing } = props;
  const { t, intl } = useI18n();
  const [open, setOpen] = useState(!!existing);
  const [asset, setAsset] = useState(tokens[0]?.assetId ?? "");
  const [refundTo, setRefundTo] = useState("");
  const [estimate, setEstimate] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<Payment | null>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const post = useCallback(
    async (dry: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ houseId, toMemberId, originAsset: asset, refundTo: refundTo.trim(), dry }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("pay.error"));
        if (dry) setEstimate(data.quote);
        else setPayment(data.payment);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("pay.error"));
      } finally {
        setBusy(false);
      }
    },
    [houseId, toMemberId, asset, refundTo, t],
  );

  // Polling del estado mientras el pago esté abierto
  useEffect(() => {
    if (!payment || !["pending", "processing"].includes(payment.status)) return;
    const tick = async () => {
      const res = await fetch(`/api/payments/${payment.id}/status`);
      if (!res.ok) return;
      const { payment: p } = await res.json();
      setPayment((prev) => (prev ? { ...prev, ...p } : p));
      if (p.status === "settled") location.reload(); // refresca balances
    };
    timer.current = setInterval(tick, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [payment]);

  if (!toHasNear) {
    return <span className="text-xs text-zinc-500">{t("pay.noNear", { name: toName })}</span>;
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={primary}>
        {t("pay.btn")}
      </button>
    );
  }

  const q = payment?.quote?.quote;
  const amountIn = q?.amountInFormatted ?? t("pay.quotedAmount");
  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-emerald-600/40 p-3 text-sm">
      {!payment ? (
        <>
          <p>{t("pay.intro", { amount: amountLabel, name: toName })}</p>
          <label className="block">
            <span className="text-zinc-500">{t("pay.payWith")}</span>
            <select className={field} value={asset} onChange={(e) => { setAsset(e.target.value); setEstimate(null); }}>
              {tokens.map((tk) => (
                <option key={tk.assetId} value={tk.assetId}>{tk.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-zinc-500">{t("pay.refund")}</span>
            <input className={field} value={refundTo} onChange={(e) => { setRefundTo(e.target.value); setEstimate(null); }} placeholder={t("pay.refundPh")} />
          </label>
          {estimate && (
            <p className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">
              {t("pay.estimate", { in: estimate.amountInFormatted, name: toName, out: estimate.amountOutFormatted, secs: estimate.timeEstimate })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={busy || !asset || refundTo.trim().length < 2} onClick={() => post(true)}>
              {t("pay.quote")}
            </button>
            <button className={primary} disabled={busy || !estimate} onClick={() => post(false)}>
              {t("pay.confirm")}
            </button>
            <button className="text-zinc-500 underline" onClick={() => setOpen(false)}>{t("pay.cancel")}</button>
          </div>
        </>
      ) : (
        <>
          <p>
            {t("pay.state")} <strong>{t(`pay.status.${payment.status}` as Key)}</strong>
            {payment.txHash && <> · tx <code className="break-all">{payment.txHash}</code></>}
          </p>
          {["pending", "processing"].includes(payment.status) && payment.depositAddress && (
            <div className="space-y-1">
              <p>
                {payment.deadline
                  ? t("pay.sendToBefore", { amount: amountIn, when: new Date(payment.deadline).toLocaleString(intl) })
                  : t("pay.sendTo", { amount: amountIn })}
              </p>
              <code className="block break-all rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">{payment.depositAddress}</code>
              {q?.depositMemo && <p>{t("pay.memo")} <code>{q.depositMemo}</code></p>}
              <p className="text-xs text-zinc-500">{t("pay.warn")}</p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  );
}
