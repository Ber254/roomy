// Validación de punta a punta contra la TESTNET REAL, con cuentas descartables (claves generadas en memoria).
//   cd tools/testnet && npm install && NODE_USE_ENV_PROXY=1 npx tsx cycle.ts      (el flag solo hace falta detrás de un proxy)
// Usa los mismos constructores de transacciones que la app (web/src/lib), no una copia.
import fs from "node:fs";
import { actions, type Account } from "near-api-js";
import { balanceOf, createFundedAccount, near, sleep, view, YOCTO } from "./lib.mjs";
import { contractCall, transferTx, nearToYocto, yoctoToNear } from "../../web/src/lib/near.ts";
import { actProposalTx, addMemberProposalKind, addProposalTx, createDaoTx, DAO_FACTORY, DEFAULT_BOND_YOCTO, transferProposalKind, voteProposalKind } from "../../web/src/lib/sputnik.ts";
import { canVote, councilOf, describeKind, tally, type ProposalOut } from "../../web/src/lib/sputnik-ui.ts";
import { makeT } from "../../web/src/i18n/index.ts";

const WASM = new URL("../../contracts/escrow/target/wasm32-unknown-unknown/release/roomy_escrow.wasm", import.meta.url);
const t = makeT("es");
let fails = 0;
const ok = (c: boolean, m: string, extra = "") => { console.log((c ? "OK   " : "FAIL ") + m + (c || !extra ? "" : "  -> " + extra)); if (!c) fails++; };
const N = (v: bigint | string) => near(String(v));
const approx = (got: bigint, want: bigint, tol = YOCTO(0.02)) => (got > want ? got - want : want - got) <= tol; // tolerancia para el gas

type AnyTx = { receiverId: string; actions: { type: string; params: any }[] };
const toActions = (tx: AnyTx) => tx.actions.map((a) => {
  if (a.type === "FunctionCall") return actions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit));
  if (a.type === "Transfer") return actions.transfer(BigInt(a.params.deposit));
  throw new Error("acción no soportada: " + a.type);
});
const send = (acc: Account, tx: AnyTx) => acc.signAndSendTransaction({ receiverId: tx.receiverId, actions: toActions(tx), waitUntil: "EXECUTED_OPTIMISTIC", retries: 0 });
async function mustFail(label: string, p: Promise<unknown>, re: RegExp) {
  try { await p; ok(false, `${label}: debía fallar y no falló`); }
  catch (e) { const m = String((e as Error).message ?? e); ok(re.test(m), `${label}: falla como se espera`, m.slice(0, 160)); }
}

async function main() {
  console.log("== Creando cuentas descartables de testnet (helper gratuito)...");
  const [escrow, treasury, host, tenant, third, newbie] = [];
  const mk = async (p: string) => { const a = await createFundedAccount(p); return a; };
  const names = ["escrow", "treasury", "host", "tenant", "third", "newbie"] as const;
  const made = await Promise.all(names.map((n) => mk("r-" + n))); // en paralelo: el helper tarda ~35 s por cuenta
  const accs = Object.fromEntries(names.map((n, i) => [n, made[i]])) as Record<(typeof names)[number], (typeof made)[number]>;
  void escrow; void treasury; void host; void tenant; void third; void newbie;
  for (const [k, a] of Object.entries(accs)) console.log(`   ${k.padEnd(9)} ${a.id}  ${N(a.balance)} NEAR`);

  // ================= ESCROW =================
  console.log("\n== ESCROW: despliegue y ciclo completo");
  const E = accs.escrow, H = accs.host, T = accs.tenant, TR = accs.treasury;
  await E.account.signAndSendTransaction({ receiverId: E.id, actions: [actions.deployContract(fs.readFileSync(WASM))], waitUntil: "EXECUTED_OPTIMISTIC" });
  await send(E.account, contractCall(E.id, "new", { admin: E.id, treasury: TR.id, fee_bps: 5 }));
  const cfg = await view(E.id, "get_config");
  ok(cfg.fee_bps === 5 && cfg.treasury === TR.id && cfg.admin === E.id, "contrato desplegado e inicializado (fee 5 bps, treasury correcto)", JSON.stringify(cfg));

  const gid = "casa1:ana";
  const AMOUNT = YOCTO(5);
  await mustFail("init dos veces", send(E.account, contractCall(E.id, "new", { admin: E.id, treasury: TR.id, fee_bps: 5 })), /already|initialized|Smart contract panicked|state/i);
  await send(T.account, contractCall(E.id, "create_guarantee", { id: gid, landlord: H.id, amount: AMOUNT.toString(), end_date_ns: null }));
  let g = await view(E.id, "get_guarantee", { id: gid });
  ok(g.status === "Pending" && g.guarantor === T.id && g.landlord === H.id, "create_guarantee: queda Pending con las partes correctas");
  await mustFail("fondear con monto incorrecto", send(T.account, contractCall(E.id, "fund_guarantee", { id: gid }, { depositYocto: YOCTO(4).toString() })), /exactamente|exactly|monto/i);
  await mustFail("fondear siendo el arrendador", send(H.account, contractCall(E.id, "fund_guarantee", { id: gid }, { depositYocto: AMOUNT.toString() })), /Solo el garante/i);
  const cBefore = await balanceOf(E.id);
  await send(T.account, contractCall(E.id, "fund_guarantee", { id: gid }, { depositYocto: AMOUNT.toString() }));
  g = await view(E.id, "get_guarantee", { id: gid });
  ok(g.status === "Active" && g.locked === AMOUNT.toString(), "fund_guarantee: queda Active con 5 NEAR bloqueados");
  ok(approx((await balanceOf(E.id)) - cBefore, AMOUNT, YOCTO(0.01)), "el contrato recibió exactamente los 5 NEAR");
  await mustFail("ejecutar sin acuerdo", send(H.account, contractCall(E.id, "execute_settlement", { id: gid })), /No hay acuerdo/i);
  await mustFail("proponer siendo ajeno", send(TR.account, contractCall(E.id, "propose_settlement", { id: gid, to_guarantor: "1", to_landlord: "0" })), /Solo las partes/i);
  await mustFail("proponer más de lo bloqueado", send(T.account, contractCall(E.id, "propose_settlement", { id: gid, to_guarantor: YOCTO(6).toString(), to_landlord: "0" })), /excede/i);

  // reparto: 3 NEAR al inquilino (con fee 0.05% = 0.0015), 1 NEAR al arrendador, 1 NEAR sigue bloqueado
  await send(T.account, contractCall(E.id, "propose_settlement", { id: gid, to_guarantor: YOCTO(3).toString(), to_landlord: YOCTO(1).toString() }));
  await mustFail("aceptar la propia propuesta", send(T.account, contractCall(E.id, "accept_settlement", { id: gid })), /propia propuesta/i);
  await send(H.account, contractCall(E.id, "accept_settlement", { id: gid }));
  ok(!!(await view(E.id, "get_agreement", { id: gid })), "accept_settlement: queda el acuerdo congelado");
  const before = { t: await balanceOf(T.id), h: await balanceOf(H.id), tr: await balanceOf(TR.id) };
  await send(H.account, contractCall(E.id, "execute_settlement", { id: gid }, { gas: "100000000000000" })); // la ejecuta el arrendador: el inquilino y el treasury no firman, su saldo es exacto
  await sleep(5000);
  const after = { t: await balanceOf(T.id), h: await balanceOf(H.id), tr: await balanceOf(TR.id) };
  const fee1 = YOCTO(3) * 5n / 10000n; // 0.0015 NEAR
  ok(after.t - before.t === YOCTO(3) - fee1, `inquilino recibe 3 NEAR menos el fee: +${N(after.t - before.t)} (esperado +${N(YOCTO(3) - fee1)})`);
  ok(after.tr - before.tr === fee1, `treasury cobra el fee de 0.05% sobre lo devuelto: +${N(after.tr - before.tr)} NEAR`);
  ok(approx(after.h - before.h, YOCTO(1)), `arrendador recibe 1 NEAR sin fee: +${N(after.h - before.h)} (descontado el gas)`);
  g = await view(E.id, "get_guarantee", { id: gid });
  ok(g.status === "Active" && g.locked === YOCTO(1).toString(), "devolución parcial: 1 NEAR sigue bloqueado y la garantía sigue Active");
  ok((await view(E.id, "get_agreement", { id: gid })) === null, "el acuerdo se consumió (no hay doble ejecución)");
  await mustFail("ejecutar de nuevo", send(H.account, contractCall(E.id, "execute_settlement", { id: gid })), /No hay acuerdo/i);
  await mustFail("devolución unilateral del garante", send(T.account, contractCall(E.id, "return_to_guarantor", { id: gid, amount: "1" })), /Solo el arrendador/i);

  const b2 = { t: await balanceOf(T.id), tr: await balanceOf(TR.id) };
  await send(H.account, contractCall(E.id, "return_to_guarantor", { id: gid, amount: YOCTO(1).toString() }, { gas: "100000000000000" }));
  await sleep(5000);
  const a2 = { t: await balanceOf(T.id), tr: await balanceOf(TR.id) };
  const fee2 = YOCTO(1) * 5n / 10000n;
  ok(a2.t - b2.t === YOCTO(1) - fee2, `return_to_guarantor: inquilino +${N(a2.t - b2.t)} NEAR (1 menos fee)`);
  ok(a2.tr - b2.tr === fee2, "el fee de la devolución también va al treasury");
  g = await view(E.id, "get_guarantee", { id: gid });
  ok(g.status === "Closed" && g.locked === "0", "al devolver todo, la garantía queda Closed con 0 bloqueado");
  const ca = (await view(E.id, "get_config")).treasury;
  ok(ca === TR.id, "el treasury no cambió");

  // ================= DAO =================
  console.log("\n== DAO (Sputnik v2): crear, aportar, proponer, votar, ejecutar");
  const members = [H.id, T.id, accs.third.id];
  const name = `roomy-e2e-${Date.now().toString(36)}`;
  const dao = `${name}.${DAO_FACTORY.testnet}`;
  const hBefore = await balanceOf(H.id);
  await send(H.account, createDaoTx(DAO_FACTORY.testnet, name, "Casa E2E", members, YOCTO(6).toString()));
  await sleep(4000);
  let policy: any;
  try { policy = await view(dao, "get_policy"); } catch (e) { ok(false, "el DAO se creó on-chain", String(e)); return; }
  ok(JSON.stringify(councilOf(policy).sort()) === JSON.stringify([...members].sort()), "createDaoTx: el DAO existe y el consejo son los 3 roomies");
  ok(policy.proposal_bond === DEFAULT_BOND_YOCTO && policy.default_vote_policy.threshold.join("/") === "1/2", "política aplicada: bond 0.1 NEAR y mayoría simple (1/2)");
  const daoBal0 = await balanceOf(dao);
  ok(daoBal0 >= YOCTO(5.4), `el DAO nació con ${N(daoBal0)} NEAR (el almacenamiento cuesta ~5.4)`);
  ok(hBefore - (await balanceOf(H.id)) >= YOCTO(5.9), "la creación costó el depósito de 6 NEAR");

  // aporte al fondo
  await send(T.account, transferTx(dao, YOCTO(2).toString()));
  await sleep(2500);
  ok(approx((await balanceOf(dao)) - daoBal0, YOCTO(2), YOCTO(0.001)), `aporte al fondo: +2 NEAR (fondo ${N(await balanceOf(dao))})`);

  const props = async () => (await view(dao, "get_proposals", { from_index: 0, limit: 50 })) as ProposalOut[];
  const bond = BigInt(policy.proposal_bond);

  // --- decisión de la casa (Vote)
  await mustFail("proponer sin el bond", send(H.account, contractCall(dao, "add_proposal", { proposal: { description: "x", kind: "Vote" } })), /ERR_MIN_BOND|bond/i);
  await send(H.account, addProposalTx(dao, "¿Compramos un aspirador compartido?", voteProposalKind(), policy.proposal_bond));
  let p = (await props())[0];
  ok(p.status === "InProgress" && p.kind === "Vote" && describeKind(p.kind, t) === "Decisión de la casa", "add_proposal Vote: queda en votación y se describe bien en la UI");
  ok(canVote(p, T.id, councilOf(policy)) && !canVote(p, TR.id, councilOf(policy)), "canVote: el consejo puede votar, el ajeno no");
  await mustFail("votar siendo ajeno al consejo", send(TR.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never)), /PERMISSION_DENIED/i);
  await send(T.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  p = (await props())[0];
  ok(p.status === "InProgress" && tally(p).yes === 1, "1 voto de 3: todavía en votación");
  ok(!canVote(p, T.id, councilOf(policy)), "quien ya votó no puede votar de nuevo (UI)");
  await mustFail("votar dos veces", send(T.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never)), /ALREADY_VOTED|voted/i);
  await send(accs.third.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  p = (await props())[0];
  ok(p.status === "Approved" && tally(p).yes === 2, "2 de 3 votos: la decisión queda Aprobada (mayoría simple)");

  // --- pago del fondo (Transfer): receptor que no firma, saldo exacto
  const recvBefore = await balanceOf(TR.id);
  const fundBefore = await balanceOf(dao);
  await send(H.account, addProposalTx(dao, "Reparación del termotanque", transferProposalKind(TR.id, YOCTO(1).toString()), policy.proposal_bond));
  p = (await props()).find((x) => x.description === "Reparación del termotanque")!;
  ok(describeKind(p.kind, t) === `Pago del fondo: 1 NEAR a ${TR.id}`, "propuesta de pago descrita en la UI: " + describeKind(p.kind, t));
  await send(T.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  await send(accs.third.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  await sleep(5000);
  p = (await props()).find((x) => x.id === p.id)!;
  ok(p.status === "Approved", "pago aprobado por mayoría");
  ok((await balanceOf(TR.id)) - recvBefore === YOCTO(1), `el destinatario recibió exactamente 1 NEAR: +${N((await balanceOf(TR.id)) - recvBefore)}`);
  ok(fundBefore - (await balanceOf(dao)) >= YOCTO(1) && fundBefore - (await balanceOf(dao)) <= YOCTO(1.2), "el fondo descontó el pago (más el bond devuelto)");

  // --- una propuesta rechazada no ejecuta nada
  await send(H.account, addProposalTx(dao, "Pago que se rechaza", transferProposalKind(TR.id, YOCTO(1).toString()), policy.proposal_bond));
  p = (await props()).find((x) => x.description === "Pago que se rechaza")!;
  const rBefore = await balanceOf(TR.id);
  await send(T.account, actProposalTx(dao, p.id, "VoteReject", p.kind as never));
  await send(accs.third.account, actProposalTx(dao, p.id, "VoteReject", p.kind as never));
  await sleep(3000);
  p = (await props()).find((x) => x.id === p.id)!;
  ok(p.status === "Rejected" && (await balanceOf(TR.id)) === rBefore, "propuesta rechazada: queda Rejected y no se mueve plata");

  // --- sumar un roomie nuevo al consejo
  await send(H.account, addProposalTx(dao, `Agregar a Beto al consejo`, addMemberProposalKind(accs.newbie.id), policy.proposal_bond));
  p = (await props()).find((x) => x.description.startsWith("Agregar a Beto"))!;
  ok(describeKind(p.kind, t) === `Agregar roomie: ${accs.newbie.id}`, "propuesta de sumar roomie descrita en la UI");
  await send(T.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  await send(accs.third.account, actProposalTx(dao, p.id, "VoteApprove", p.kind as never));
  await sleep(3000);
  const policy2 = await view(dao, "get_policy");
  ok(councilOf(policy2).includes(accs.newbie.id) && councilOf(policy2).length === 4, "AddMemberToRole aprobada: el consejo pasa a 4 miembros");
  const all = await props();
  ok(all.length >= 4 && all.every((x) => typeof x.id === "number" && x.vote_counts && x.votes), `get_proposals devuelve ${all.length} propuestas con el formato que lee la UI`);
}

main().then(() => { console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLO(S)`); process.exit(fails ? 1 : 0); })
  .catch((e) => { console.error("EXCEPCIÓN:", e?.message ?? e); process.exit(2); });
