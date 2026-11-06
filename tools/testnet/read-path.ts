// Prueba que la app web lee el escrow REAL de testnet: crea una casa en la base local, abre una garantía on-chain
// (cuentas descartables) y comprueba que la ruta de la API y la pantalla muestran el estado correcto.
//   Requiere la app corriendo en E2E_BASE (por defecto :3114) con NEXT_PUBLIC_ESCROW_CONTRACT apuntando al contrato.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { actions } from "near-api-js";
import { createFundedAccount, view } from "./lib.mjs";
import { contractCall, guaranteeId } from "../../web/src/lib/near.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const ESCROW = process.env.NEXT_PUBLIC_ESCROW_CONTRACT ?? "roomy-escrow-bernardo.testnet";
const { chromium } = createRequire(import.meta.url)("playwright");
const sql = (q: string) => execSync(`PGPASSWORD=roomy psql -h localhost -U roomy -d roomy_test -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
let fails = 0;
const ok = (c: boolean, m: string, x = "") => { console.log((c ? "OK   " : "FAIL ") + m + (c || !x ? "" : "  -> " + x)); if (!c) fails++; };
const Y = (n: number) => (BigInt(Math.round(n * 1e6)) * 10n ** 18n).toString();
const call = (acc: any, method: string, args: object, deposit = "0") => {
  const tx = contractCall(ESCROW, method, args as Record<string, unknown>, { depositYocto: deposit });
  const a = tx.actions[0].params;
  return acc.account.signAndSendTransaction({ receiverId: ESCROW, actions: [actions.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit))], waitUntil: "EXECUTED_OPTIMISTIC", retries: 0 });
};

const [host, tenant] = await Promise.all([createFundedAccount("r-rhost"), createFundedAccount("r-rten")]);
console.log("host:", host.id, "| inquilino:", tenant.id);

// casa + miembros en la base local
const houseId = crypto.randomUUID(), hostM = crypto.randomUUID(), tenM = crypto.randomUUID();
const tokH = crypto.randomBytes(16).toString("hex"), tokT = crypto.randomBytes(16).toString("hex");
sql(`insert into houses (id, name, invite_code) values ('${houseId}', 'Casa Real', 'RP${Math.floor(1000 + Math.random() * 8999)}')`);
sql(`insert into members (id, house_id, display_name, wallet_account, is_host, session_token) values ('${hostM}','${houseId}','Hugo','${host.id}',true,'${tokH}'),('${tenM}','${houseId}','Ana','${tenant.id}',false,'${tokT}')`);

const id = guaranteeId(houseId, tenM);
await call(tenant, "create_guarantee", { id, landlord: host.id, amount: Y(2), end_date_ns: null });
await call(tenant, "fund_guarantee", { id }, Y(2));
await call(tenant, "propose_settlement", { id, to_guarantor: Y(1.5), to_landlord: Y(0.5) });
const chain = await view(ESCROW, "get_guarantee", { id });
ok(chain.status === "Active" && chain.locked === Y(2), "garantía real creada, fondeada y con propuesta abierta en testnet");

const cookie = { name: `roomy_${houseId.replace(/-/g, "")}`, value: tokH, url: BASE };
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "es-AR", viewport: { width: 760, height: 1500 } });
await ctx.addCookies([cookie]);

// 1) la ruta de la API devuelve el estado real
const api = await ctx.request.get(`${BASE}/api/guarantees/${houseId}/${tenM}`);
const j = await api.json();
ok(api.status() === 200 && j.deployed === true && j.guarantee?.status === "Active" && j.guarantee?.guarantor === tenant.id && j.guarantee?.landlord === host.id, "GET /api/guarantees devuelve la garantía real (Active, partes correctas)", JSON.stringify(j).slice(0, 200));
ok(j.settlement?.proposer === tenant.id && j.settlement?.to_guarantor === Y(1.5), "y la propuesta abierta (1.5 / 0.5 NEAR)");
ok(j.agreement === null, "sin acuerdo todavía");

// 2) la pantalla de la casa lo muestra
const page = await ctx.newPage();
const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`${BASE}/h/${houseId}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Acordado 2 NEAR", { timeout: 30000 });
const text = (await page.innerText("main")).replace(/ /g, " ");
ok(text.includes(ESCROW), "la pantalla muestra el contrato configurado: " + ESCROW);
ok(/Ana[\s\S]*activa/.test(text), "la tarjeta de Ana dice 'activa'");
ok(text.includes("Acordado 2 NEAR · bloqueado 2 NEAR"), "muestra los montos: acordado 2 y bloqueado 2 NEAR");
ok(text.includes(`garante ${tenant.id} → arrendador ${host.id}`), "muestra las partes reales de la garantía");
ok(new RegExp(`Propuesta de ${tenant.id.replace(/\./g, "\\.")}: inquilino 1\\.5 · arrendador 0\\.5 NEAR`).test(text), "muestra la propuesta abierta con los montos correctos");
ok(errs.length === 0, "sin errores de JavaScript", errs.join(" | "));
await page.screenshot({ path: process.env.SHOT ?? "/tmp/escrow-real.png", fullPage: true });

// 3) una casa sin garantía muestra 'sin garantía' y no rompe
const house2 = crypto.randomUUID(), h2m = crypto.randomUUID(), t2m = crypto.randomUUID(), tok2 = crypto.randomBytes(16).toString("hex");
sql(`insert into houses (id, name, invite_code) values ('${house2}', 'Casa Vacía', 'RQ${Math.floor(1000 + Math.random() * 8999)}')`);
sql(`insert into members (id, house_id, display_name, wallet_account, is_host, session_token) values ('${h2m}','${house2}','Hugo','${host.id}',true,'${tok2}'),('${t2m}','${house2}','Beto','${tenant.id}',false,'${crypto.randomBytes(8).toString("hex")}')`);
await ctx.addCookies([{ name: `roomy_${house2.replace(/-/g, "")}`, value: tok2, url: BASE }]);
await page.goto(`${BASE}/h/${house2}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=sin garantía", { timeout: 30000 });
ok(true, "una casa sin garantía on-chain muestra 'sin garantía' (el contrato responde null sin romper la página)");
await browser.close();
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLO(S)`);
process.exit(fails ? 1 : 0);
