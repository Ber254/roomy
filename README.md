# Roomy

App para personas que comparten piso: gastos, pagos, garantías y convivencia en un solo lugar.
Liquidaciones vía **NEAR Intents** y garantías on-chain en **NEAR**.

> Proyecto para NEAR Hackathon 2026. Wallet del proyecto: `hakaroomy.near`.

## Estructura

- `web/` — Next.js 15 + TypeScript + Tailwind
- `contracts/escrow/` — contrato escrow de garantías en NEAR (Rust, `near-sdk` 5)
- `web/drizzle/` — migraciones (Neon Postgres + Drizzle)

## Desarrollo

```bash
cd web
npm install
npm run dev
```

## Estado

Día 1 de 11: scaffold, schema (Neon + Drizzle) y lógica de balances con tests. Spike de NEAR Intents (1Click API) pendiente.

## Seguimiento

Ver [`docs/PROGRESS.md`](docs/PROGRESS.md) (estado, bloqueos, decisiones) y [`docs/PLAN.md`](docs/PLAN.md) (alcance y cronograma).
