import type { SwapStatus } from "./intents";

export type PaymentStatusValue = "pending" | "processing" | "settled" | "failed" | "refunded";

/** Traduce el estado de 1Click al estado interno del pago. */
export function mapSwapStatus(s: SwapStatus): PaymentStatusValue {
  switch (s) {
    case "SUCCESS":
      return "settled";
    case "REFUNDED":
      return "refunded";
    case "FAILED":
      return "failed";
    case "PROCESSING":
    case "KNOWN_DEPOSIT_TX":
      return "processing";
    default: // PENDING_DEPOSIT, INCOMPLETE_DEPOSIT
      return "pending";
  }
}

/** Regla oficial de cuentas NEAR (2 a 64 caracteres, minúsculas). */
const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const isNearAccount = (s: string) => s.length >= 2 && s.length <= 64 && NEAR_ACCOUNT.test(s);
