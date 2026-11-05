import { NEAR_NETWORK } from "./near";

// Lectura de estado on-chain (solo servidor). RPC configurable por entorno.
// Los RPC públicos *.near.org están en desuso (responden 429 "THIS ENDPOINT IS DEPRECATED"): se usa FastNEAR por defecto.
// Se puede cambiar con NEAR_RPC_URL.
const DEFAULT_RPC = {
  mainnet: "https://rpc.mainnet.fastnear.com",
  testnet: "https://rpc.testnet.fastnear.com",
} as const;

export const rpcUrl = () => process.env.NEAR_RPC_URL ?? DEFAULT_RPC[NEAR_NETWORK];

/** Llama a un método de vista del contrato y devuelve el JSON decodificado. */
export async function viewCall<T>(contract: string, method: string, args: object): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "roomy",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC: ${data.error.cause?.name ?? data.error.message ?? "error"}`);
  const result = data.result?.result as number[] | undefined;
  if (data.result?.error) throw new Error(`Contrato: ${String(data.result.error).slice(0, 200)}`);
  if (!result) throw new Error("Respuesta RPC sin resultado");
  return JSON.parse(Buffer.from(result).toString("utf8")) as T;
}

/** Saldo de una cuenta en yoctoNEAR (string). */
export async function viewAccountBalance(accountId: string): Promise<string> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "roomy",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC: ${data.error.cause?.name ?? data.error.message ?? "error"}`);
  if (data.result?.error) throw new Error(`RPC: ${String(data.result.error).slice(0, 120)}`);
  const amount = data.result?.amount;
  if (typeof amount !== "string") throw new Error("Respuesta RPC sin saldo");
  return amount;
}
