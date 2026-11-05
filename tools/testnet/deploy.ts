// Despliega el escrow en testnet en una cuenta con nombre fijo y verifica que el código on-chain es el compilado.
//   ESCROW_ACCOUNT=roomy-escrow-bernardo.testnet KEY_FILE=/ruta/privada/key.txt npx tsx deploy.ts
// La clave del deploy se guarda SOLO en KEY_FILE (permisos 600, fuera del repo) y nunca se imprime.
import crypto from "node:crypto";
import fs from "node:fs";
import { actions, baseEncode } from "near-api-js";
import { createFundedAccount, near, provider, view } from "./lib.mjs";

const WASM = new URL("../../contracts/escrow/target/wasm32-unknown-unknown/release/roomy_escrow.wasm", import.meta.url);
const NAME = process.env.ESCROW_ACCOUNT ?? "roomy-escrow-bernardo.testnet";
const KEY_FILE = process.env.KEY_FILE;
if (!KEY_FILE) throw new Error("Definí KEY_FILE (ruta fuera del repo donde guardar la clave del deploy)");

const wasm = fs.readFileSync(WASM);
const localHash = baseEncode(crypto.createHash("sha256").update(wasm).digest());
const e = await createFundedAccount("unused", NAME);
fs.writeFileSync(KEY_FILE, e.key.toString() + "\n", { mode: 0o600 });
console.log(`cuenta creada: ${e.id} (${near(e.balance)} NEAR) — clave guardada en KEY_FILE`);

await e.account.signAndSendTransaction({ receiverId: e.id, actions: [actions.deployContract(wasm)], waitUntil: "EXECUTED_OPTIMISTIC" });
await e.account.signAndSendTransaction({
  receiverId: e.id,
  actions: [actions.functionCall("new", { admin: e.id, treasury: e.id, fee_bps: 5 }, 30_000_000_000_000n, 0n)],
  waitUntil: "EXECUTED_OPTIMISTIC",
});
const onchain = await provider.query({ request_type: "view_account", finality: "optimistic", account_id: e.id });
const cfg = await view(e.id, "get_config");
console.log("hash local:   ", localHash);
console.log("hash on-chain:", onchain.code_hash);
console.log("config:", JSON.stringify(cfg));
const ok = onchain.code_hash === localHash && cfg.fee_bps === 5 && cfg.admin === e.id;
console.log(ok ? "DESPLIEGUE OK: el código on-chain es idéntico al compilado" : "DESPLIEGUE CON PROBLEMAS");
process.exit(ok ? 0 : 1);
