// Cliente mínimo de la 1Click API de NEAR Intents (https://docs.near-intents.org).
// Esquema verificado contra https://1click.chaindefuser.com/docs/v0/openapi.yaml
// No existe testnet de Intents: se usa `dry: true` para cotizar sin mover fondos.

const BASE = process.env.ONECLICK_API_URL ?? "https://1click.chaindefuser.com";

/** USDC nativo en NEAR: activo de liquidación de Roomy. 6 decimales. */
export const USDC_NEAR =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/** 1 centavo de USD = 10_000 unidades base de USDC (6 decimales). */
export const centsToUsdcUnits = (cents: number): string => {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("cents inválido");
  return String(cents * 10_000);
};

export type IntentsToken = {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price?: number;
};

export type QuoteInput = {
  dry: boolean;
  /** assetId del activo con el que paga el deudor (ver getTokens) */
  originAsset: string;
  /** cuenta NEAR del acreedor: recibe exactamente `amountOutCents` en USDC */
  recipient: string;
  /** dirección en la cadena de origen donde se reembolsa si el swap falla */
  refundTo: string;
  amountOutCents: number;
  destinationAsset?: string;
  slippageBps?: number;
  deadlineMinutes?: number;
};

export type Quote = {
  quote: {
    depositAddress?: string; // ausente en dry
    depositMemo?: string;
    amountIn: string;
    amountInFormatted: string;
    minAmountIn: string;
    amountOut: string;
    amountOutFormatted: string;
    timeEstimate: number;
    deadline?: string;
  };
  signature: string;
  correlationId: string;
};

export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export type StatusResponse = {
  status: SwapStatus;
  updatedAt: string;
  swapDetails?: {
    nearTxHashes?: string[];
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
  };
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const jwt = process.env.ONECLICK_JWT; // opcional: sin JWT hay un fee de 0.2%
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`1Click ${path} -> ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const getTokens = () => call<IntentsToken[]>("/v0/tokens");

/**
 * Cotiza un pago de deuda. EXACT_OUTPUT: el acreedor recibe exactamente el monto
 * adeudado en USDC sobre NEAR; el deudor deposita lo necesario (el excedente se reembolsa).
 */
export function requestQuote(i: QuoteInput) {
  const deadline = new Date(Date.now() + (i.deadlineMinutes ?? 120) * 60_000);
  return call<Quote>("/v0/quote", {
    method: "POST",
    body: JSON.stringify({
      dry: i.dry,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: i.slippageBps ?? 100,
      originAsset: i.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: i.destinationAsset ?? USDC_NEAR,
      amount: centsToUsdcUnits(i.amountOutCents),
      refundTo: i.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: i.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: deadline.toISOString(),
    }),
  });
}

export function getStatus(depositAddress: string, depositMemo?: string) {
  const q = new URLSearchParams({ depositAddress });
  if (depositMemo) q.set("depositMemo", depositMemo);
  return call<StatusResponse>(`/v0/status?${q}`);
}

/** Estados finales: no hace falta seguir consultando. */
export const isFinal = (s: SwapStatus) =>
  s === "SUCCESS" || s === "REFUNDED" || s === "FAILED";
