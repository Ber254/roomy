# Roomy — Seguimiento de avances

**Deadline:** 14 de noviembre de 2026 (entrega objetivo: 13-nov) · **Track:** Real-World Money
**Wallet:** `hakaroomy.near` · **Repo:** https://github.com/Ber254/roomy

Leyenda: ✅ hecho · 🟡 en curso · ⬜ pendiente · ⛔ bloqueado

## Estado general

| Área | Estado | Nota |
|---|---|---|
| Scaffold Next.js 15 + Tailwind | ✅ | `web/` |
| Schema DB (Neon + Drizzle) | ✅ | Aplicado a Neon con `db:push` (10 tablas) |
| Lógica de balances + tests | ✅ | `web/src/lib/balances.ts` |
| Contrato escrow (Rust) | ✅ | Reescrito con el modelo de Safexy: acuerdo entre partes, parciales, fee 0.05%. 24 tests; **no desplegado**. Ver `docs/ESCROW.md` |
| Pagos vía NEAR Intents (cliente) | ✅ | `web/src/lib/intents.ts`: tokens, quote `EXACT_OUTPUT`, status. Dry quote real verificado (7 tests, incl. en vivo) |
| UI: casas, invitaciones, gastos | 🟡 | Escrita (inicio, panel de casa, acciones). Compila y pasa lint, **sin probar contra la base**: falta probarla en local |
| UI: pagar con Intents | 🟡 | Hecho: cotizar, confirmar, dirección de depósito, polling de estado. **Sin probar contra la base ni con un pago real.** Falta firma desde wallet (hoy el depósito es manual) |
| UI: garantías on-chain | ⬜ | |
| Chat (polling), tareas | ⬜ | |
| Votación, calendario | ⬜ | Mockup / solo si hay tiempo |
| Deploy en Vercel | ⬜ | |
| README final, video, post en X, entrega | ⬜ | |

## Bloqueos y pendientes del usuario

- ✅ Red desbloqueada (04-nov): `1click.chaindefuser.com` y `nearhackathon.com` en Allowed domains. Aplicó en la misma sesión.
- ⬜ Crear proyecto en Neon y poner `DATABASE_URL` en `web/.env.local` (no compartir por chat), luego `npm run db:push`.
- ✅ Repo de Safexy recibido (`Ber254/stellar-rental-guarantee`): está en Stellar/Soroban, ver decisión del 04-nov.
- ✅ Reglas del hackathon leídas: ver `docs/HACKATHON_RULES.md`. Límite de entrega: 14-nov 23:59 UTC (20:59 Argentina).
- ⬜ **Decisión del usuario:** qué tracks marcar (ver `docs/HACKATHON_RULES.md`) y si se integra Sputnik DAO.
- ⬜ Crear subcuenta `escrow.hakaroomy.near` y desplegar el contrato (la clave de deploy nunca va al repo).

## Decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 03-nov | Repo nuevo `roomy`, separado de `rugby-hpu` | `rugby-hpu` tiene proyectos no relacionados y el repo de entrega debe ser público y limpio |
| 03-nov | Neon + Drizzle en vez de Supabase | Pedido del usuario. Costo: sin realtime ni auth incluidos, el chat usa polling |
| 03-nov | Montos en centavos (integer) y garantías en yoctoNEAR (string) | Evita errores de punto flotante y desbordes |
| 03-nov | Escrow propio; Safexy detrás de un adapter | Safexy es una incógnita sin docs; no depender de ello para la demo |
| 03-nov | Sin auth con wallet: invitación por link + nombre | Ahorra días; la wallet se usa solo para pagar y depositar |
| 04-nov | Safexy no se "embebe": es Stellar (Soroban, USDC testnet), el hackathon exige NEAR. Se usa el escrow NEAR propio y se toma el modelo de Safexy (acuerdo entre partes, devoluciones parciales, fee) como diseño | Cross-chain real es inviable: Safexy es solo testnet y NEAR Intents opera solo en mainnet. No se presenta como integración lo que no lo es |

## Riesgos abiertos

- El escrow deja el `release`/`slash` en manos del hospedante. Documentado en el contrato; mejora futura: aprobación por votación.
- NEAR Intents opera en mainnet, sin testnet: las pruebas usan fondos reales (US$1 a 2).
- El esquema real de la API de 1Click sigue sin verificar.

## Bitácora

### 2026-11-03 (día 1)
- Repo `Ber254/roomy` creado y adjuntado; scaffold de Next.js 15 pusheado.
- Schema Drizzle/Neon, migración `0000` y lógica de balances con 6 tests.
- Contrato escrow en `contracts/escrow` con 7 tests unitarios.
- Intento de spike de 1Click bloqueado por política de red (403).

### 2026-11-04 (día 2)
- Revisado `Ber254/stellar-rental-guarantee` (Safexy): Next.js + Drizzle/Neon + contrato Soroban en Stellar testnet.
- Decisión: escrow NEAR propio como garantía on-chain; portar a NEAR el flujo de acuerdo de Safexy (solicitar devolución, aprobar/rechazar/contraofertar, devoluciones parciales).
- 1Click sigue bloqueado (403) tras reintento.
- Schema aplicado a Neon por el usuario (`npm run db:push` OK). Bug corregido: `drizzle.config.ts` no cargaba `.env.local`.
- UI v0: crear casa, unirse con código, registrar gastos con split, balances y deudas simplificadas. Botón "Pagar con NEAR" deshabilitado hasta tener el cliente de Intents.
- Pendiente de probar: flujo completo en local (`npm run dev`), porque el entorno no llega a Neon.

### 2026-11-04 (día 2, tarde)
- Red desbloqueada. Reglas del hackathon verificadas en `docs/HACKATHON_RULES.md`: **ninguna integración es obligatoria**; Intents suma pero no es requisito.
- Spike de 1Click OK: `POST /v0/quote` con `dry: true`, HTTP 201. 1 USDC (Base) -> 0.994796 USDC (NEAR) en `hakaroomy.near`, ETA 35 s. Con `EXACT_OUTPUT`, para entregar 1.000000 USDC el pagador deposita 1.015222 (el excedente se reembolsa).
- `web/src/lib/intents.ts` + tests. Nota: en el sandbox, el `fetch` de Node necesita `NODE_USE_ENV_PROXY=1` para las pruebas en vivo (`INTENTS_LIVE=1`); en una máquina normal no.
- Pendiente de decidir: el pago real de ~US$1 en mainnet requiere fondos y firma del usuario (no se hace sin confirmación explícita).
- Botón "Pagar con NEAR": `POST /api/payments` (cotiza dry o crea el pago; la deuda se recalcula en el servidor), `GET /api/payments/[id]/status` (sincroniza con 1Click), `PayButton` en el panel y formulario de cuenta NEAR por roomie.
- Migración `0001` agrega `quote`, `deadline`, `origin_symbol`, `refund_to` a `payments`: **hay que correr `npm run db:push` de nuevo.**
- Escrow reescrito en NEAR con el modelo de Safexy (proponer/aceptar/contraofertar, devoluciones parciales, devolución unilateral del arrendador, fee 5 bps solo sobre lo devuelto). 24 tests, compila a wasm. Sin extensiones de plazo. Declarado en `docs/ESCROW.md` como baseline Stellar + reescritura nueva.
- Siguiente: UI de garantías (conectar wallet, fondear, proponer/aceptar) y despliegue en testnet, luego `escrow.hakaroomy.near` en mainnet (requiere al usuario).
