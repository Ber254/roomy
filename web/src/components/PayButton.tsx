"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
        if (!res.ok) throw new Error(data.error ?? "Error");
        if (dry) setEstimate(data.quote);
        else setPayment(data.payment);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusy(false);
      }
    },
    [houseId, toMemberId, asset, refundTo],
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
    return <span className="text-xs text-zinc-500">{toName} debe configurar su cuenta NEAR</span>;
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={primary}>
        Pagar con NEAR
      </button>
    );
  }

  const q = payment?.quote?.quote;
  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-emerald-600/40 p-3 text-sm">
      {!payment ? (
        <>
          <p>
            Vas a pagar <strong>{amountLabel}</strong> a {toName}. Él/ella recibe USDC en NEAR vía NEAR Intents.
          </p>
          <label className="block">
            <span className="text-zinc-500">Pagás con</span>
            <select className={field} value={asset} onChange={(e) => { setAsset(e.target.value); setEstimate(null); }}>
              {tokens.map((t) => (
                <option key={t.assetId} value={t.assetId}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-zinc-500">Tu dirección en esa red (para reembolsos)</span>
            <input className={field} value={refundTo} onChange={(e) => { setRefundTo(e.target.value); setEstimate(null); }} placeholder="0x… / cuenta.near / …" />
          </label>
          {estimate && (
            <p className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">
              Depositás ≈ <strong>{estimate.amountInFormatted}</strong> · {toName} recibe <strong>{estimate.amountOutFormatted} USDC</strong> · ~{estimate.timeEstimate}s.
              El excedente se reembolsa.
            </p>
          )}
          <div className="flex gap-2">
            <button className={primary} disabled={busy || !asset || refundTo.trim().length < 2} onClick={() => post(true)}>
              Cotizar
            </button>
            <button className={primary} disabled={busy || !estimate} onClick={() => post(false)}>
              Confirmar y obtener dirección
            </button>
            <button className="text-zinc-500 underline" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <p>
            Estado: <strong>{payment.status}</strong>
            {payment.txHash && <> · tx <code className="break-all">{payment.txHash}</code></>}
          </p>
          {["pending", "processing"].includes(payment.status) && payment.depositAddress && (
            <div className="space-y-1">
              <p>
                Enviá <strong>{q?.amountInFormatted ?? "el monto cotizado"}</strong> a esta dirección
                {payment.deadline && <> antes de {new Date(payment.deadline).toLocaleString("es-AR")}</>}:
              </p>
              <code className="block break-all rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">{payment.depositAddress}</code>
              {q?.depositMemo && <p>Memo obligatorio: <code>{q.depositMemo}</code></p>}
              <p className="text-xs text-zinc-500">Enviá solo el activo y la red elegidos. Si algo falla, se reembolsa a tu dirección.</p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  );
}
