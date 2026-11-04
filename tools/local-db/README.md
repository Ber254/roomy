# Base local de pruebas

Permite correr Roomy contra un Postgres local sin tocar tu base de Neon. Es solo para desarrollo y pruebas.

## Requisitos
Un Postgres local (por ejemplo `apt install postgresql`, Postgres.app o Docker) con una base `roomy_test`.

```bash
createdb roomy_test
for f in ../../web/drizzle/0*.sql; do psql roomy_test -f "$f"; done   # aplica las migraciones
npm install && PG_URL=postgresql://USUARIO:CLAVE@localhost/roomy_test npm start
```

En `web/.env.local`:

```
DATABASE_URL=postgresql://USUARIO:CLAVE@localhost/roomy_test
NEON_FETCH_ENDPOINT=http://localhost:4444/sql
```

Sin `NEON_FETCH_ENDPOINT` la app usa Neon como siempre.
