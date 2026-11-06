# Roomy

**Share a home without arguing about money.** Roomy is a web app for people who share a home: it tracks shared expenses,
works out who owes whom, and settles debts in USDC on **NEAR** — paying from whatever chain you already use through
**NEAR Intents**. Rent deposits are held in a **NEAR smart contract**, and every house gets a **Sputnik DAO** for votes and a
shared fund.

Built for **NEAR HACKATHON 2026**. Tracks: Real-World Money · Social Money · Open Innovation.

- Live demo: https://roomy-house.vercel.app
- Escrow contract (testnet): `roomy-escrow-bernardo.testnet`
- Project wallet: `hakaroomy.near`

## The problem

Sharing a home means informal money juggling: someone fronts the rent, nobody remembers who owes what, payments get chased
in group chats, and the security deposit sits in one person's hands.

## What it does

| Feature | What you can do |
|---|---|
| Houses | Create a house, invite roommates with a 6-letter code (no sign-up) |
| Expenses | Log shared expenses, split between any subset; exact-to-the-cent splits |
| Balances | Per-person balance and the **fewest transfers** needed to settle up |
| Payments | Pay a debt from any supported chain; the roommate receives **exactly** the amount owed in USDC on NEAR (NEAR Intents, `EXACT_OUTPUT`) |
| Deposits | Rent deposit in a NEAR contract: release needs a proposal from one side and acceptance from the other; partial returns; 0.05% fee only on what returns to the tenant |
| Votes + shared fund | Each house gets a Sputnik DAO: roommates vote on decisions, contribute to a fund and approve payouts from it |
| Chat, chores | House chat; weekly chores that rotate between roommates |
| Languages, themes | Spanish / English; pastel light theme and a dark theme |

## How NEAR fits in

1. **NEAR Intents (1Click API)** settles each debt across chains. The payer deposits USDC/USDT from another chain; the roommate
   gets the exact amount owed in USDC on NEAR. The server recomputes the debt (the client never sets the amount), keeps one
   open payment per pair, stores the signed quote, and polls the swap status.
2. **Escrow contract (Rust, `near-sdk` 5)** in `contracts/escrow`: guarantees with roles per guarantee, mutual-agreement
   settlements, partial returns and a fee that is charged only on the tenant's share.
3. **Sputnik DAO v2**: created through the official factory with a house policy (council = roommates, simple majority,
   0.1 NEAR proposal bond). The app builds the same transactions that were validated on testnet.
4. **NEAR Connect** (`@hot-labs/near-connect`) for wallet connection and signing.

## Verified status (what has actually been run)

| Area | Evidence |
|---|---|
| App flows (houses, expenses, balances, chat, chores, authorization, i18n, theme) | 63 end-to-end checks with three users in separate browsers against a real Postgres (`tools/e2e`) |
| Escrow on **testnet** | Full lifecycle with exact balances: 44 checks, 0 failures (`tools/testnet/cycle.ts`) |
| Sputnik DAO on **testnet** | Create, contribute, propose, vote (2 of 3), approved payout with exact balance, rejection, add member: same 44 checks |
| App reads the real contract | 11 checks: API + page show the real on-chain guarantee (`tools/testnet/read-path.ts`) |
| Real wallets (Meteor) on the public demo | DAO `casa-test-1.sputnikv2.testnet` created, decision proposed and approved; guarantee in `roomy-escrow-bernardo.testnet` created, funded, split proposed, accepted by the other wallet, executed and closed; two Meteor accounts, all signed from the web UI (manual run, testnet) |
| Wallet integration + signing from the web UI | 17 checks, 9 transactions signed from the UI buttons through the real `near-connect` connector with a test wallet (`tools/testnet/wallet-ui.ts`): guarantee create/fund/propose/accept/execute, DAO create, propose and vote |
| NEAR Intents quotes | Real quotes verified (deposit address, signature, deadline, `PENDING_DEPOSIT` status) |
| Contract unit tests | 24 |
| App unit tests | 57 |

**Not yet verified (to be updated before submission):** a completed cross-chain payment (deposit → `SUCCESS`). The DAO flow and
the guarantee flow **were** verified with real Meteor Wallets on the public demo (testnet): DAO create (6 NEAR), propose a decision
(0.1 NEAR bond, returned on approval) and vote to `Approved`; guarantee create, fund (2 NEAR), propose a 1.5/0.5 split, accept
from the other wallet, execute (tenant +1.49925 NEAR after the 0.05% fee, landlord +0.5) and close.

## Try it (no wallet needed for the first steps)

1. Open the demo, create a house, copy the invite code.
2. In a private window, join with that code. → both roommates appear.
3. Add an expense of `3.00` split between both. → one owes `US$ 1,50` and the debt is listed.
4. Set a NEAR account on the creditor, then on the debtor tap **Pay with NEAR**, pick an asset, enter a refund address and tap
   **Get quote**. → the exact amount to deposit and the estimated time are shown. **Confirm** shows the deposit address and
   starts status polling.
5. Write in the chat from one window. → it appears in the other within ~3 s.

### Reproduce the on-chain checks without a wallet

```bash
cd contracts/escrow && cargo build --release --target wasm32-unknown-unknown   # needs: rustup target add wasm32-unknown-unknown
cd ../../tools/testnet && npm install && npx tsx cycle.ts
```

This creates disposable testnet accounts (keys generated in memory, never stored), deploys the escrow and runs the full
escrow + DAO cycle, ending with `TODO OK` (44 checks). It uses the same transaction builders as the app (`web/src/lib`).

### On-chain features from the web UI (testnet wallet needed)

Connect a testnet wallet (network: testnet). Create the house DAO as the host (needs ~6 NEAR of testnet funds), then propose
and vote. Guarantees are created and funded by the tenant's wallet.

## Run it locally

Requirements: Node 22, a Postgres database (Neon or local).

```bash
cd web
cp .env.example .env.local      # set DATABASE_URL
npm install
npm run db:push                  # create tables
npm run dev                      # http://localhost:3000
npm test                         # 57 unit tests
```

To run against a local Postgres without Neon, see `tools/local-db`. The end-to-end browser test is in `tools/e2e`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon (or any Postgres via `tools/local-db`) |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` (default) or `mainnet` |
| `NEXT_PUBLIC_ESCROW_CONTRACT` | Escrow account (`roomy-escrow-bernardo.testnet`) |
| `NEXT_PUBLIC_DAO_CREATE_DEPOSIT_NEAR` | DAO creation deposit (default 6) |
| `ONECLICK_JWT` | Optional 1Click JWT (without it a 0.2% fee applies) |

## Repository layout

```
web/                 Next.js 15 + TypeScript + Tailwind (app, API routes, Drizzle schema)
contracts/escrow/    Rust escrow contract (near-sdk 5)
tools/testnet/       Real-testnet validation (escrow + DAO) with disposable accounts
tools/e2e/           End-to-end browser test
tools/local-db/      Local Postgres adapter for the Neon HTTP driver
docs/                Progress log, plan, rules summary, escrow notes
```

## Disclosures

- **Prior work on another chain (rule Q-002).** The escrow's product model comes from my earlier project **Safexy**, built on
  Stellar/Soroban before the hackathon (`Ber254/stellar-rental-guarantee`). No Safexy code was reused: the NEAR contract was
  rewritten from scratch in Rust during the hackathon following Safexy's documented specification. Only the NEAR integration is
  presented as hackathon work. Safexy's contract extensions (period extensions) are not ported.
- **AI-assisted development (rule Q-005).** This project was built with Claude Code (Anthropic). All code was reviewed and
  validated by running it; the testnet checks above are the evidence.
- **Libraries.** Next.js, React, Tailwind CSS, Drizzle ORM, `@neondatabase/serverless`, `next-themes`,
  `@hot-labs/near-connect`, `near-sdk` (Rust), `near-api-js` (validation tools), Vitest, Playwright.

## Known limitations

- Sessions are a cookie token chosen at join time: no passwords, and anyone with the invite code can join. Fine for a demo,
  not for production.
- The deposit is held in NEAR (volatile). A USDC (NEP-141) version is the natural next step.
- If a payout recipient account does not exist, that transfer fails and the funds stay unassigned in the contract.
- The escrow has no period extensions; escrow and DAO run on **testnet**, payments through Intents on **mainnet**.
- The Intents recipient must be registered with the USDC token contract on NEAR.

## License

MIT — see [LICENSE](LICENSE).
