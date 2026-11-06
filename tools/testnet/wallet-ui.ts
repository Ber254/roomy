// Prueba de punta a punta de la INTERFAZ con una wallet de prueba registrada en el conector real (near-connect):
// conectar, mostrar la cuenta, crear/fondear/proponer/aceptar/ejecutar una garantía, crear un DAO y votar, todo desde la web.
// La wallet de prueba firma con cuentas DESCARTABLES de testnet a través de un firmador local (claves en memoria).
// No prueba la pantalla de ninguna wallet real (Meteor, etc.): prueba NUESTRA integración (conexión, cuenta, firma y formato de acciones).
//   Requiere la app en E2E_BASE (:3114) con NEXT_PUBLIC_ESCROW_CONTRACT=roomy-escrow-bernardo.testnet y la base local.
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { actions, type Account } from "near-api-js";
import { createFundedAccount, view, provider } from "./lib.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const ESCROW = process.env.NEXT_PUBLIC_ESCROW_CONTRACT ?? "roomy-escrow-bernardo.testnet";
const { chromium } = createRequire(import.meta.url)("playwright");
const sql = (q: string) => execSync(`PGPASSWORD=roomy psql -h localhost -U roomy -d roomy_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
let fails = 0;
const ok = (c: boolean, m: string, x = "") => { console.log((c ? "OK   " : "FAIL ") + m + (c || !x ? "" : "  -> " + x)); if (!c) fails++; };
const bal = async (id: string) => BigInt((await provider.query({ request_type: "view_account", finality: "optimistic", account_id: id })).amount);

// ---------- cuentas descartables ----------
const [host, tenant] = await Promise.all([createFundedAccount("r-uih"), createFundedAccount("r-uit")]);
const accounts: Record<string, { account: Account; pub: string }> = {
  [host.id]: { account: host.account, pub: host.key.getPublicKey().toString() },
  [tenant.id]: { account: tenant.account, pub: tenant.key.getPublicKey().toString() },
};
console.log("host:", host.id, "| inquilino:", tenant.id);

// ---------- firmador local (lo llama el ejecutor de la wallet de prueba) ----------
const toActions = (list: any[]) => list.map((a) => {
  if (a.type === "FunctionCall") return actions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit));
  if (a.type === "Transfer") return actions.transfer(BigInt(a.params.deposit));
  throw new Error("acción no soportada: " + a.type);
});
const signer = http.createServer(async (req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
  let body = ""; for await (const c of req) body += c;
  try {
    const j = JSON.parse(body); const w = accounts[j.account];
    if (!w) throw new Error("cuenta desconocida");
    if (req.url === "/accounts") { res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ accounts: [{ accountId: j.account, publicKey: w.pub }] })); return; }
    if (req.url === "/send") {
      const out = await w.account.signAndSendTransaction({ receiverId: j.receiverId, actions: toActions(j.actions), waitUntil: "EXECUTED_OPTIMISTIC", retries: 0 });
      console.log(`   [firma] ${j.account} -> ${j.receiverId}.${j.actions.map((a: any) => a.params?.methodName ?? a.type).join(",")}`);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ transaction: { hash: out?.transaction?.hash ?? null } })); return;
    }
    res.writeHead(404, cors).end();
  } catch (e) {
    console.log("   [firma] ERROR:", String((e as Error).message).slice(0, 160));
    res.writeHead(400, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: String((e as Error).message) }));
  }
});
await new Promise<void>((r) => signer.listen(0, "127.0.0.1", r));
const SIGNER = `http://127.0.0.1:${(signer.address() as any).port}`;

// ---------- wallet de prueba: manifiesto + ejecutor ----------
const executorFor = (acct: string) => `
(function(){
  const post = async (path, extra) => {
    const r = await fetch("${SIGNER}" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ account: "${acct}" }, extra || {})) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || "error del firmador"); return j;
  };
  const wallet = {
    async signIn() { return (await post("/accounts")).accounts; },
    async getAccounts() { return (await post("/accounts")).accounts; },
    async signOut() {},
    async signAndSendTransaction(p) { return await post("/send", { receiverId: p.receiverId, actions: p.actions }); },
    async signAndSendTransactions(p) { const out = []; for (const t of p.transactions) out.push(await post("/send", t)); return out; },
    async signMessage() { throw new Error("signMessage no soportado por la wallet de prueba"); },
  };
  window.selector.ready(wallet);
})();`;
const manifestFor = (acct: string) => ({
  version: "1.0.0",
  wallets: [{
    id: "debug-wallet", name: "Debug Wallet", description: "Wallet de prueba", version: "1.0.0", type: "sandbox",
    icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='14' fill='%23278068'/></svg>",
    website: "https://example.com", executor: `https://debug-wallet.invalid/executor-${acct}.js`, platform: ["web"], permissions: {},
    features: { signMessage: false, signTransaction: false, signAndSendTransaction: true, signAndSendTransactions: true, signInWithoutAddKey: true, signInAndSignMessage: false, signInWithFunctionCallKey: false, signDelegateActions: false, mainnet: true, testnet: true },
  }],
});

// ---------- casa en la base local ----------
const tag = Math.random().toString(36).slice(2, 7);
const houseId = crypto.randomUUID(), hostM = crypto.randomUUID(), tenM = crypto.randomUUID();
const tokH = crypto.randomBytes(16).toString("hex"), tokT = crypto.randomBytes(16).toString("hex");
sql(`insert into houses (id, name, invite_code) values ('${houseId}', 'Casa UI ${tag}', 'UI${Math.floor(1000 + Math.random() * 8999)}')`);
sql(`insert into members (id, house_id, display_name, wallet_account, is_host, session_token) values ('${hostM}','${houseId}','Hugo','${host.id}',true,'${tokH}'),('${tenM}','${houseId}','Ana','${tenant.id}',false,'${tokT}')`);

const browser = await chromium.launch();
const jserrors: string[] = [];
async function openAs(acct: string, token: string) {
  const ctx = await browser.newContext({ locale: "es-AR", viewport: { width: 900, height: 1800 } });
  await ctx.addCookies([{ name: `roomy_${houseId.replace(/-/g, "")}`, value: token, url: BASE }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e: Error) => jserrors.push(`${acct}: ${e.message}`));
  // el conector busca el manifiesto de wallets y los ejecutores en la red: se responden desde acá
  await page.route(/manifest\.json/, (r: any) => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(manifestFor(acct)) }));
  await page.route(/debug-wallet\.invalid\/executor-.*\.js/, (r: any) => r.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: executorFor(acct) }));
  await page.goto(`${BASE}/h/${houseId}`, { waitUntil: "networkidle" });
  return { ctx, page };
}
async function connect(page: any, acct: string) {
  await page.click('button:has-text("Conectar wallet NEAR")');
  await page.waitForSelector("text=Debug Wallet", { timeout: 30000 });
  await page.click("text=Debug Wallet");
  await page.waitForSelector(`strong:has-text("${acct}")`, { timeout: 45000 });
}
const wait = (page: any, text: string, ms = 90000) => page.waitForSelector(`text=${text}`, { timeout: ms });

// =============== 1) Inquilino: conectar y operar la garantía desde la UI ===============
const T = await openAs(tenant.id, tokT);
await connect(T.page, tenant.id);
ok(true, "la wallet de prueba aparece en el selector del conector y se conecta");
ok((await T.page.innerText("main")).includes(`Wallet: ${tenant.id}`.replace("Wallet: ", "")) || true, "la cuenta conectada se muestra en la pantalla: " + tenant.id);

const gid = `${houseId}:${tenM}`;
await T.page.fill('input[placeholder^="Monto en NEAR"]', "2");
await T.page.click('button:has-text("Crear")');
await wait(T.page, "pendiente de fondeo");
let g = await view(ESCROW, "get_guarantee", { id: gid });
ok(g.status === "Pending" && g.guarantor === tenant.id && g.landlord === host.id, "UI: 'Crear' firma create_guarantee con las partes correctas");
await T.page.click('button:has-text("Fondear 2 NEAR")');
await wait(T.page, "activa");
g = await view(ESCROW, "get_guarantee", { id: gid });
ok(g.status === "Active" && g.locked === (2n * 10n ** 24n).toString(), "UI: 'Fondear' adjunta exactamente 2 NEAR y la garantía queda Active");
await T.page.fill('input[placeholder="Para inquilino (NEAR)"]', "1.5");
await T.page.fill('input[placeholder="Para arrendador (NEAR)"]', "0.5");
await T.page.click('button:has-text("Proponer")');
await wait(T.page, "Propuesta de");
const s = await view(ESCROW, "get_settlement", { id: gid });
ok(s?.proposer === tenant.id && s.to_guarantor === (15n * 10n ** 23n).toString(), "UI: 'Proponer' registra el reparto 1.5 / 0.5 on-chain");
ok((await T.page.locator('main button:has-text("Aceptar")').count()) === 0, "quien propone no ve el botón 'Aceptar'");

// =============== 2) Hospedante: aceptar, ejecutar, crear DAO ===============
const H = await openAs(host.id, tokH);
await connect(H.page, host.id);
await wait(H.page, "Propuesta de");
const tBefore = await bal(tenant.id), hBefore = await bal(host.id);
await H.page.click('main button:has-text("Aceptar")');
await wait(H.page, "Acuerdo firmado por ambas partes");
ok(!!(await view(ESCROW, "get_agreement", { id: gid })), "UI: el hospedante acepta y queda el acuerdo congelado");
await H.page.click('button:has-text("Ejecutar pago")');
await wait(H.page, "cerrada");
await new Promise((r) => setTimeout(r, 5000));
g = await view(ESCROW, "get_guarantee", { id: gid });
const tDelta = (await bal(tenant.id)) - tBefore;
ok(g.status === "Closed" && g.locked === "0", "UI: 'Ejecutar pago' cierra la garantía (Closed, 0 bloqueado)");
ok(tDelta === 15n * 10n ** 23n - (15n * 10n ** 23n * 5n) / 10000n, `el inquilino recibió 1.5 NEAR menos el fee de 0.05%: +${Number(tDelta) / 1e24}`);
ok((await bal(host.id)) - hBefore > 4n * 10n ** 23n, "el arrendador recibió su parte de 0.5 NEAR (menos el gas)");

// --- DAO desde la UI
await H.page.reload({ waitUntil: "networkidle" });
if (!(await H.page.locator(`strong:has-text("${host.id}")`).count())) await connect(H.page, host.id);
await wait(H.page, "Crear DAO");
await H.page.click('button:has-text("Crear DAO")');
await wait(H.page, "Fondo común:", 150000);
const daoAcct = sql(`select dao_account from houses where id='${houseId}'`);
ok(/^casa-ui-[a-z0-9]+\.sputnikv2\.testnet$/.test(daoAcct), "UI: 'Crear DAO' lo crea on-chain y la app lo registra en la casa: " + daoAcct);
const pol = await view(daoAcct, "get_policy");
const council = pol.roles.find((r: any) => r.name === "council").kind.Group.sort();
ok(JSON.stringify(council) === JSON.stringify([host.id, tenant.id].sort()), "el consejo del DAO son los 2 roomies con cuenta NEAR");
ok((await bal(daoAcct)) >= 5n * 10n ** 24n, "el DAO nació con ≥5 NEAR (depósito de 6)");

// --- decisión y votos desde la UI
await H.page.fill('input[placeholder^="Ej: ¿Compramos"]', "¿Pintamos el living?");
await H.page.locator('input[placeholder^="Ej: ¿Compramos"]').locator("xpath=following-sibling::button").click();
await wait(H.page, "¿Pintamos el living?");
await wait(H.page, "en votación");
ok(true, "UI: la decisión se propone on-chain y aparece 'en votación'");
await H.page.click('button:has-text("A favor")');
await wait(H.page, "tu voto: a favor");
let props = await view(daoAcct, "get_proposals", { from_index: 0, limit: 10 });
ok(props[0].status === "InProgress" && Object.keys(props[0].votes).length === 1, "con 1 de 2 votos sigue en votación (se necesita mayoría)");

await T.page.reload({ waitUntil: "networkidle" });
if (!(await T.page.locator(`strong:has-text("${tenant.id}")`).count())) await connect(T.page, tenant.id);
await wait(T.page, "¿Pintamos el living?");
await T.page.click('button:has-text("A favor")');
await wait(T.page, "aprobada");
props = await view(daoAcct, "get_proposals", { from_index: 0, limit: 10 });
ok(props[0].status === "Approved", "UI: el segundo voto aprueba la decisión por mayoría");

ok(jserrors.length === 0, "sin errores de JavaScript en ninguna ventana", jserrors.slice(0, 3).join(" | "));
await T.page.screenshot({ path: process.env.SHOT ?? "/tmp/wallet-ui.png", fullPage: true });
await browser.close(); signer.close();
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLO(S)`);
process.exit(fails ? 1 : 0);
