// Envía NEAR de TESTNET (sin valor) a una cuenta de prueba, desde una cuenta descartable recién creada con el helper gratuito.
//   FUND_TO=cuenta.testnet FUND_AMOUNT=9.5 npx tsx fund.ts
import { actions } from "near-api-js";
import { balanceOf, createFundedAccount, near, YOCTO } from "./lib.mjs";

const to = process.env.FUND_TO;
const amount = Number(process.env.FUND_AMOUNT ?? "9.5");
if (!to || !to.endsWith(".testnet")) throw new Error("FUND_TO debe ser una cuenta .testnet (esto nunca toca mainnet)");
const src = await createFundedAccount("r-fund");
const before = await balanceOf(to);
await src.account.signAndSendTransaction({ receiverId: to, actions: [actions.transfer(YOCTO(amount))], waitUntil: "EXECUTED_OPTIMISTIC", retries: 0 });
await new Promise((r) => setTimeout(r, 3000));
const after = await balanceOf(to);
console.log(`${to}: ${near(before)} -> ${near(after)} NEAR (+${near(after - before)})`);
process.exit(0);
