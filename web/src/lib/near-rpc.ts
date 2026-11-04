import { NEAR_NETWORK } from "./near";

// Lectura de estado on-chain (solo servidor). RPC configurable por entorno.
const DEFAULT_RPC = {
  mainnet: "https://rpc.mainnet.near.org",
  testnet: "https://rpc.testnet.near.org",
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
