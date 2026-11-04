# NEAR Hackathon 2026 — reglas verificadas

Fuente: https://nearhackathon.com y https://nearhackathon.com/HACKATHON.md (leídas el 2026-11-04).
Releer la versión en vivo antes de enviar: fechas y reglas pueden cambiar.

## Fechas (UTC)

| Hito | Fecha |
|---|---|
| Inicio | 1-nov-2026 00:00 |
| **Límite de entrega** | **14-nov-2026 23:59 UTC = 20:59 en Argentina (UTC-3)** |
| Jurado | 16 a 18-nov |
| Resultados | hasta 18-nov 23:59 |

Objetivo interno: **entregar el 13-nov**.

## Premios

Pool de US$250.000 pagado en NEAR: gran premio US$55K; por cada uno de los 13 tracks, 1º US$10K, 2º US$3K, 3º US$2K. Pago único en los 30 días siguientes a los resultados, a la cuenta NEAR indicada en el formulario.

## Entrega (todo obligatorio)

1. Repo **público** (un repo solo puede enviarse una vez). Incluir archivo LICENSE.
2. Post en X: decir que se construyó en NEAR HACKATHON, etiquetar `@NEARProtocol` y `#NEARHackathon` (opcional `@NearLegion`, `@NearBuilders`), con video o screenshots.
3. Formulario (o `POST /api/applications`): nombre, líder, email, tamaño de equipo, tracks, cuenta NEAR de pago, link al repo, link al post, descripción de 20 a 2000 caracteres (problema, producto, cómo encaja NEAR), consentimiento.
4. Un error se corrige con "Request changes", **nunca** reenviando.

## Reglas que cambian nuestras decisiones

- **No hay integraciones obligatorias (Q-011).** Los tags son sugerencias; "un contrato propio en NEAR que encaje con el track alcanza". NEAR Intents suma, pero no es requisito.
- **No existe testnet de Intents (Q-007).** Mainnet, cuentas de desarrollo separadas, montos mínimos y cotizaciones `dry`.
- **Ventana de código (Q-001, Q-004):** cuenta lo escrito desde el anuncio (19-oct-2026). Lo anterior es "baseline".
- **Producto previo en otra cadena (Q-002):** permitido; solo se juzga la integración NEAR construida en la ventana. **Hay que declararlo en el README** (caso Safexy en Stellar).
- **Librerías, plantillas y código de IA (Q-005):** permitidos; listarlos en el README.
- **Demo local (Q-012):** válida si el repo es reproducible y el video está en X. Una demo hospedada suma; mantenerla hasta el 18-nov (idealmente 25-nov).
- **Dos proyectos por persona (Q-015):** permitido si son independientes y cada README nombra al otro.
- **Pre-filtro automático (Q-017):** Claude Code y Codex revisan primero que el proyecto corra y haga lo que dice el README. Deciden humanos. El README debe tener pasos "hacer X, ver Y" que un revisor pueda seguir.
- **Criterios de jurado de ediciones previas:** implementación técnica, diseño, impacto, originalidad, sostenibilidad.

## Tracks relevantes para Roomy

| Track | Descripción oficial | Encaje |
|---|---|---|
| `realworld` | Nómina, facturación, remesas, pagos y rieles de stablecoins "para empresas reales; algo que una empresa normal pueda usar mañana". Hints: stablecoins, NEAR Intents, meta transactions | Pagos de alquiler y gastos en USDC vía Intents. Encaje parcial: el foco declarado son negocios, no particulares |
| `social` | Presupuestos compartidos y propiedad colectiva **sobre Sputnik DAO y Trezu** | Solo si se usa Sputnik DAO de verdad (por ejemplo, tesorería de la casa y aprobación de liberar garantías) |
| `open` | Ideas que no encajan en una categoría. Hints: chain abstraction | Encaje seguro como segundo track |

Se pueden marcar varios tracks en una sola entrega.
