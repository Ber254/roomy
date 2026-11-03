# Roomy

App para personas que comparten piso: gastos, pagos, garantías y convivencia en un solo lugar.
Liquidaciones vía **NEAR Intents** y garantías on-chain en **NEAR**.

> Proyecto para NEAR Hackathon 2026. Wallet del proyecto: `hakaroomy.near`.

## Estructura

- `web/` — Next.js 15 + TypeScript + Tailwind
- `contracts/escrow/` — contrato escrow en NEAR (pendiente)
- `web/drizzle/` — migraciones (Neon Postgres + Drizzle)

## Desarrollo

```bash
cd web
npm install
npm run dev
```

## Estado

Día 1 de 11: scaffold, schema (Neon + Drizzle) y lógica de balances con tests. Spike de NEAR Intents (1Click API) pendiente.
