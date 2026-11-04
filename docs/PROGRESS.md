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
| UI: casas, invitaciones, gastos | ✅ | Verificado de punta a punta contra Postgres real |
| UI: pagar con Intents | 🟡 | Hecho: cotizar, confirmar, dirección de depósito, polling de estado. **Sin probar contra la base ni con un pago real.** Falta firma desde wallet (hoy el depósito es manual) |
| UI: garantías on-chain | 🟡 | Panel por inquilino: crear, fondear, proponer/aceptar/rechazar, ejecutar, devolver. Render verificado en navegador con API simulada. **Sin probar con wallet ni contrato desplegado** |
| Chat (polling) | ✅ | Verificado de punta a punta contra Postgres real (ver `tools/e2e`) |
| Tareas con turnos | ✅ | Verificado de punta a punta contra Postgres real (asignación, permisos, rotación) |
| Votación y fondo común (Sputnik DAO) | 🟡 | UI completa: crear DAO, aportar, proponer decisión/pago/sumar roomie, votar. Verificada en navegador con wallet simulada (19 chequeos). **Sin probar en testnet con wallet real** (condición de salida: 9-nov) |
| Calendario | ⬜ | Mockup / solo si hay tiempo |
| Deploy en Vercel | ⬜ | |
| README final, video, post en X, entrega | ⬜ | |

## Bloqueos y pendientes del usuario

- ✅ Red desbloqueada (04-nov): `1click.chaindefuser.com` y `nearhackathon.com` en Allowed domains. Aplicó en la misma sesión.
- ⬜ Crear proyecto en Neon y poner `DATABASE_URL` en `web/.env.local` (no compartir por chat), luego `npm run db:push`.
- ✅ Repo de Safexy recibido (`Ber254/stellar-rental-guarantee`): está en Stellar/Soroban, ver decisión del 04-nov.
- ✅ Reglas del hackathon leídas: ver `docs/HACKATHON_RULES.md`. Límite de entrega: 14-nov 23:59 UTC (20:59 Argentina).
- ✅ Tracks decididos (04-nov, el usuario delegó): **Social Money** (con Sputnik DAO), **Real-World Money** y **Open Innovation**. Condición de salida abajo.
- ⬜ Crear subcuenta `escrow.hakaroomy.near` y desplegar el contrato (la clave de deploy nunca va al repo).

## Decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 03-nov | Repo nuevo `roomy`, separado de `rugby-hpu` | `rugby-hpu` tiene proyectos no relacionados y el repo de entrega debe ser público y limpio |
| 03-nov | Neon + Drizzle en vez de Supabase | Pedido del usuario. Costo: sin realtime ni auth incluidos, el chat usa polling |
| 03-nov | Montos en centavos (integer) y garantías en yoctoNEAR (string) | Evita errores de punto flotante y desbordes |
| 03-nov | Escrow propio; Safexy detrás de un adapter | Safexy es una incógnita sin docs; no depender de ello para la demo |
| 03-nov | Sin auth con wallet: invitación por link + nombre | Ahorra días; la wallet se usa solo para pagar y depositar |
| 04-nov | Sumar **Sputnik DAO** y apuntar a Social Money (además de Real-World Money y Open Innovation) | Social Money pide "presupuestos compartidos y propiedad colectiva sobre Sputnik DAO", que es literalmente una casa; Real-World Money apunta a "empresas reales" y Roomy encaja a medias. Convierte la votación de mockup en feature real on-chain (propuestas `Vote`) y el fondo común en propuestas `Transfer`. Costo absorbible: el avance va ~4 días adelantado. Sin datos de competencia: la decisión se basa en encaje y riesgo |
| 04-nov | **Condición de salida de Social Money:** si el 9-nov el ciclo crear DAO -> proponer -> votar -> ejecutar no funciona en testnet con wallet real, se retira el track Social Money y la votación queda como demo etiquetada | No afirmar en el README ni en el formulario lo que no corre; el pre-filtro automático verifica que el proyecto haga lo que dice |
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

### 2026-11-04 (día 2, noche)
- Migración de `payments` aplicada por el usuario en Neon (`Changes applied`).
- UI de garantías: `GuaranteePanel` (conexión con `@hot-labs/near-connect`, red configurable), `GET /api/guarantees/[houseId]/[memberId]` (lee el estado on-chain por RPC; la cadena es la fuente de verdad), utilidades `near.ts` (yocto sin punto flotante) y `near-rpc.ts`. 24 tests.
- Verificado en Chromium real (viewport móvil) con la API simulada: renderiza estados y montos. **No verificado:** conexión de wallet, firma de transacciones, lectura real por RPC (los RPC de NEAR están bloqueados en el entorno).
- Config nueva en `web/.env.example`: `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_ESCROW_CONTRACT`, `NEAR_RPC_URL`, `ONECLICK_JWT`.
- Siguiente: desplegar el escrow en testnet (requiere cuenta testnet del usuario) y probar el ciclo completo con wallet.

### 2026-11-04 (día 2, cierre)
- Decisión de tracks (delegada por el usuario): Social Money + Real-World Money + Open Innovation, con condición de salida el 9-nov.
- Leído el código de `near-daos/sputnik-dao-contract`: existen `Vote` (señalización sin ejecución), `Transfer`, `AddMemberToRole`; `act_proposal` exige reenviar el `kind`; el bond por defecto es 1 NEAR (usamos 0.1 NEAR con política propia).
- `web/src/lib/sputnik.ts`: política de casa, crear DAO vía factory, proponer, votar. **Sin probar en red.** El depósito de creación del DAO es un parámetro a confirmar en testnet (no verificado).
- Siguiente: columna `houses.dao_account`, UI de votación y fondo común, cuenta testnet del usuario, despliegue del escrow en testnet.

### 2026-11-04 (día 2, noche II)
- UI de votación y fondo común: `DaoPanel` (crear DAO vía factory, aporte al fondo, propuestas `Vote`/`Transfer`/`AddMemberToRole`, votar a favor o en contra), `WalletProvider` compartido con `GuaranteePanel`, rutas `POST /api/dao` y `GET /api/dao/[houseId]`.
- Seguridad: solo el hospedante registra el DAO, una sola vez, y solo si existe on-chain, es subcuenta del factory y su consejo lo incluye. El bond de cada propuesta se lee de la política del DAO (el contrato exige el monto exacto).
- Verificado en Chromium con una wallet simulada que captura las transacciones: 19 chequeos del DAO y 5 de garantías (tx correctas, bloqueos de quien ya votó, quien no está en el consejo y quien propone). Los scripts de prueba no están en el repo.
- Migración `0002` agrega `houses.dao_account`: **hay que correr `npm run db:push`.**
- **No verificado:** firma con wallet real, el depósito de creación del DAO (parámetro `NEXT_PUBLIC_DAO_CREATE_DEPOSIT_NEAR`, default 6, a confirmar en testnet), lectura real por RPC.

### 2026-11-04 (día 2, noche III)
- Migración `0002` aplicada por el usuario en Neon (`dao_account`).
- Chat de la casa: polling cada 3 s (pausa con la pestaña oculta), sin duplicados, solo pide lo posterior al último mensaje. Límite de 1000 caracteres.
- Tareas con turnos: asignación en orden, rotación semanal al siguiente roomie, solo quien la tiene o el hospedante la marca. Semanas desde el lunes 00:00 UTC.
- 46 tests unitarios. **Pendiente de probar contra Neon:** las rutas y acciones de chat y tareas (solo la lógica pura y la UI están verificadas). RPC de NEAR sigue bloqueado: no se avanzó con el despliegue del escrow.

### 2026-11-04 (día 2, noche IV) — base local y prueba de punta a punta
- `tools/local-db`: proxy que habla el protocolo HTTP de Neon contra cualquier Postgres (probado con Postgres 16 local). La app lo usa solo si existe `NEON_FETCH_ENDPOINT`; sin esa variable usa Neon como siempre. Batch atómico verificado (rollback ante error).
- `tools/e2e/e2e.js`: 3 usuarios en navegadores distintos contra el build de producción y Postgres real. **55 verificaciones, todas pasan**: crear casa, unirse con código (y código inválido), gastos y splits exactos, deudas simplificadas, validaciones, aislamiento sin sesión (401), cuenta NEAR, cotización `dry` real de 1Click, un solo pago abierto por par, liquidación que baja la deuda, chat por polling entre dos usuarios, límites del chat, HTML mostrado como texto (sin XSS), tareas con permisos y rotación semanal, rutas de DAO y garantías con RPC caído (502 controlado, sin crash).
- Bug encontrado y corregido: si 1Click no puede resolver los datos (por ejemplo, cuenta NEAR de destino inexistente) responde `400 Internal server error`, que llegaba tal cual al usuario. Ahora se traduce a un mensaje accionable (`friendlyQuoteError`).
- **Límites de esta verificación:** la cotización real (no `dry`) solo corre con `E2E_REAL_QUOTE=1`; el depósito, la firma con wallet, el RPC de NEAR y el DAO/escrow en red siguen sin probar. Dos fallos intermedios de la prueba eran de la propia prueba (expresión demasiado laxa y lectura antes del render), no de la app.

### 2026-11-04 (día 2, noche V) — red de NEAR desbloqueada y primeras verificaciones on-chain
- RPC permitidos (`rpc.{testnet,mainnet}.{near.org,fastnear.com}`): responden 200 desde el entorno.
- **Verificado contra testnet real** (`NEAR_LIVE=1 npm test`, 3 pruebas de solo lectura):
  - el factory `sputnikv2.testnet` existe (5.403 DAOs);
  - la forma de nuestra política de casa (`housePolicy`) es idéntica a la de un DAO real (claves, roles, permisos, `default_vote_policy`);
  - propuestas `Vote` y `Transfer` reales se leen bien con `describeKind` y `tally`.
- Corregido: el RPC devuelve `vote_counts` como números, no como strings (tipo ajustado).
- **Depósito de creación del DAO verificado indirectamente:** los DAOs reales en testnet ocupan ~543 KB (~5.4 NEAR de almacenamiento bloqueado; el código del repo del factory usa contratos globales con mínimo de 0.01 NEAR, pero el factory desplegado en testnet no lo hace). Mínimo práctico ~5.5 NEAR; el default de 6 queda justificado. Ya no es "a confirmar", pero la creación real aún no se ejecutó.
- Nombres sugeridos disponibles en testnet: `roomy-escrow-bernardo`, `roomy-hugo-bernardo`, `roomy-ana-bernardo` (`.testnet`).
- **Siguen sin verificar:** firma con wallet real, ejecución de `create` del DAO, despliegue del escrow y su ciclo, pago real por Intents.

### 2026-11-04 (día 2, noche VI) — idioma, tema claro pastel y validaciones
- **Idioma ES/EN** en toda la app (landing, panel de la casa, componentes on-chain, errores de acciones y de la API, formato de moneda y fechas). Diccionarios tipados (`web/src/i18n`): si falta una clave en un idioma, no compila; hay pruebas de que ambos tienen las mismas claves y los mismos `{parámetros}`. Idioma por defecto: cookie > `Accept-Language` (es* -> español, otro -> inglés) > español.
- **Tema claro en tonos pastel** (lavanda/menta, contrastes WCAG verificados) y tema oscuro; botón en la barra superior, persiste. Sigue el tema del sistema hasta que la persona elige.
- Título de la landing: "Compartir un piso sin discutir. ¡Organizate!" (EN: "Share your place without arguing. Get organized!").
- Corregido: la pestaña decía "Create Next App" y `lang="en"`. Ahora hay metadatos reales (título, descripción, Open Graph) por idioma.
- Verificación: 63 chequeos de punta a punta (incluye idioma, formato de montos, cookie, errores de API en inglés, tema) y 57 pruebas unitarias.
- **Validación de tracks** con las reglas oficiales: ids `realworld`, `social`, `open` son válidos. Encaje: Open Innovation seguro; Real-World Money parcial (pide "empresas reales"); Social Money depende de que el DAO funcione (condición de salida 9-nov).
- **Validación on-chain, estado:** (1) cotización real de 1Click verificada (HTTP 201, dirección, firma, plazo; estado `PENDING_DEPOSIT`); falta el depósito real. (2) escrow y (3) DAO: pendientes de correr en testnet; el servicio de cuentas gratuitas de testnet es `helper.nearprotocol.com` (según el código de near-cli-rs), pendiente de permitir en la red del entorno.
- 1Click rechaza algunas direcciones de reembolso con `refundTo is not valid`: ahora se traduce a un mensaje amigable.
