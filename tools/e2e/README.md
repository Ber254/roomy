# Prueba de punta a punta

Simula a tres roomies (hospedante, Ana y Beto) en navegadores separados contra la app real y un Postgres real.
Cubre: crear casa, unirse con código, gastos y balances, deudas simplificadas, pagos con NEAR Intents,
chat con polling, tareas con turnos, autorización entre casas y respuestas controladas cuando el RPC de NEAR no está disponible.

**Borra todas las tablas** de la base que uses: usá solo una base de pruebas.

## Pasos

1. Base y proxy local: ver [`../local-db/README.md`](../local-db/README.md).
2. App de producción contra esa base:

```bash
cd web
export DATABASE_URL=postgresql://USUARIO:CLAVE@localhost/roomy_test
export NEON_FETCH_ENDPOINT=http://127.0.0.1:4444/sql
export NEXT_PUBLIC_ESCROW_CONTRACT=escrow.test.testnet
npm run build && npx next start -p 3114
```

3. Playwright (`npm i -D playwright` donde prefieras) y:

```bash
node tools/e2e/e2e.js
```

Variables opcionales: `E2E_BASE` (URL de la app), `E2E_PGUSER`, `E2E_PGPASSWORD`, `E2E_PGDB`.
La cotización `dry` de 1Click se hace siempre (no mueve fondos). Una cotización **real** (genera una dirección de
depósito para `hakaroomy.near`) solo se pide con `E2E_REAL_QUOTE=1`.
