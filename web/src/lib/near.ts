// Configuración y utilidades NEAR compartidas (cliente y servidor). Sin dependencias de wallet.

export type NearNetwork = "mainnet" | "testnet";

export const NEAR_NETWORK: NearNetwork =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

/** Cuenta donde está desplegado el contrato escrow. Vacío = todavía no desplegado. */
export const ESCROW_CONTRACT = process.env.NEXT_PUBLIC_ESCROW_CONTRACT ?? "";

const YOCTO = 24;

/** "1.5" -> "1500000000000000000000000". Sin punto flotante; hasta 24 decimales. */
export function nearToYocto(input: string): string | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,24})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const y = BigInt(int + frac.padEnd(YOCTO, "0"));
  return y > BigInt(0) ? y.toString() : null;
}

/** yoctoNEAR (string) -> NEAR legible, sin ceros sobrantes. */
export function yoctoToNear(yocto: string): string {
  const y = BigInt(yocto);
  const base = BigInt(10) ** BigInt(YOCTO);
  const int = y / base;
  const frac = (y % base).toString().padStart(YOCTO, "0").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : `${int}`;
}

/** Id on-chain determinista: una garantía por inquilino y casa. */
export const guaranteeId = (houseId: string, memberId: string) => `${houseId}:${memberId}`;

export const GAS_DEFAULT = "30000000000000"; // 30 Tgas
export const GAS_PAYOUT = "100000000000000"; // 100 Tgas: métodos que transfieren

/** Transacción de llamada a función en el formato de near-connect. */
export function contractCall(
  contract: string,
  method: string,
  args: Record<string, unknown>,
  opts: { depositYocto?: string; gas?: string } = {},
) {
  return {
    receiverId: contract,
    actions: [
      {
        type: "FunctionCall" as const,
        params: {
          methodName: method,
          args,
          gas: opts.gas ?? GAS_DEFAULT,
          deposit: opts.depositYocto ?? "0",
        },
      },
    ],
  };
}
