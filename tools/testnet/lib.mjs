// Utilidades para validar contra la testnet real con cuentas DESCARTABLES: las claves se generan en memoria
// y nunca se guardan ni se imprimen. Solo testnet: estas cuentas no tienen ningún valor.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

export const RPC = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const HELPER = process.env.NEAR_HELPER_URL ?? "https://helper.nearprotocol.com/account";
export const provider = new JsonRpcProvider({ url: RPC });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const near = (yocto) => Number(BigInt(yocto) / 10n ** 20n) / 10_000; // yocto -> NEAR (4 decimales)
export const YOCTO = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n; // NEAR -> yocto (hasta 6 decimales)

/** Crea una cuenta de testnet con el servicio gratuito (el mismo que usa near-cli-rs) y devuelve un Account listo para firmar. */
export async function createFundedAccount(prefix, fixedId) {
  const key = KeyPair.fromRandom("ed25519");
  const id = fixedId ?? `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.testnet`;
  const res = await fetch(HELPER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`helper ${res.status}: ${text.slice(0, 200)}`);
  // esperar a que la cuenta exista on-chain
  for (let i = 0; i < 20; i++) {
    try {
      const v = await provider.query({ request_type: "view_account", finality: "optimistic", account_id: id });
      const account = new Account(id, provider, new KeyPairSigner(key));
      return { id, account, key, balance: BigInt(v.amount) };
    } catch {
      await sleep(1500);
    }
  }
  throw new Error(`la cuenta ${id} no apareció on-chain`);
}

export async function balanceOf(accountId) {
  const v = await provider.query({ request_type: "view_account", finality: "optimistic", account_id: accountId });
  return BigInt(v.amount);
}

export async function view(contract, method, args = {}) {
  const r = await provider.query({
    request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}
