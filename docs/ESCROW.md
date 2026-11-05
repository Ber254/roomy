# Escrow de garantías en NEAR

Contrato: `contracts/escrow` (Rust, `near-sdk` 5). Dinero: **NEAR nativo** (yoctoNEAR).

## Origen y declaración (regla Q-002 del hackathon)

El modelo de producto viene de **Safexy**, un proyecto previo del mismo autor construido en **Stellar/Soroban**
(`Ber254/stellar-rental-guarantee`, USDC en testnet). Ese código es *baseline* anterior al hackathon y **no se
reutilizó**: este contrato es una reescritura nueva en Rust para NEAR, hecha dentro de la ventana, que sigue la
especificación documentada de Safexy (`SMART_CONTRACT.md`). Solo la integración NEAR es lo que se presenta como
trabajo del hackathon.

## Modelo

Los roles pertenecen a cada garantía: el **garante** (inquilino) la fondea; el **arrendador** (hospedante) es el beneficiario.

```
Pending -> Active -> Closed      (sigue Active mientras locked > 0)
Pending -> Cancelled
```

| Función | Quién | Efecto |
|---|---|---|
| `create_guarantee(id, landlord, amount, end_date_ns?)` | garante | Registra la garantía, `Pending` |
| `fund_guarantee(id)` payable | garante | Deposita exactamente `amount`, `Active` |
| `cancel_guarantee(id)` | una parte | Solo en `Pending` |
| `propose_settlement(id, to_guarantor, to_landlord)` | una parte | Propone un reparto; reemplaza la propuesta abierta |
| `accept_settlement(id)` | la OTRA parte | Congela el acuerdo |
| `reject_settlement(id)` | una parte | Descarta la propuesta |
| `execute_settlement(id)` | cualquiera | Paga el acuerdo congelado |
| `return_to_guarantor(id, amount)` | arrendador | Devolución unilateral (solo beneficia al garante) |
| `set_treasury`, `set_fee_bps` | admin | Fee con tope 5% |
| `get_guarantee`, `get_settlement`, `get_agreement`, `get_config`, `quote_fee` | vistas | |

## Invariantes (cubiertos por tests)

1. Solo el garante fondea, y con el monto exacto; solo las partes actúan.
2. No hay retiro unilateral del garante: toda salida requiere propuesta de una parte y aceptación de la otra.
3. `to_guarantor + to_landlord <= locked`, verificado al proponer, aceptar y ejecutar.
4. El estado se escribe antes de transferir: no hay doble ejecución.
5. Reparto parcial: el resto sigue bloqueado y se puede volver a negociar.
6. Fee de 0.05% (5 bps) **solo sobre lo que vuelve al garante**, redondeado hacia arriba, al `treasury`.

## Limitaciones conocidas

- Sin extensiones de plazo (Safexy las tiene; quedan fuera del MVP).
- Si una cuenta destino no existe, esa transferencia falla y los fondos quedan sin saldo asignado en el contrato.
  Mitigación futura: callback con reintento.
- El garante pone NEAR, que es volátil. Siguiente paso natural: garantías en USDC (NEP-141, `ft_on_transfer`).
- Sin desplegar. Requiere `escrow.hakaroomy.near` y una clave de deploy que nunca va al repo.

## Errores encontrados al validar en testnet real (2026-11-05)

Los 24 tests unitarios pasaban, pero al correr el contrato en la cadena real aparecieron dos defectos que el entorno
simulado no puede mostrar:

1. **Compilación sin `--cfg near`.** `near-sdk` tiene una rama "host" (llamadas reales a la cadena) y otra "local"
   (pura de Rust). Compilado con `cargo build` común usa la local: se perdían los mensajes de error
   (`WebAssembly trap: unreachable` en lugar de `Smart contract panicked: ...`). Se arregló con
   `contracts/escrow/.cargo/config.toml` (`rustflags = ["--cfg", "near"]` para el target wasm), de modo que
   `cargo build --release --target wasm32-unknown-unknown` ya compila bien. `cargo near build` lo hace solo.
2. **Promesa unida devuelta.** `execute_settlement` y `return_to_guarantor` devolvían `p1.and(p2)`. El runtime de NEAR lo
   prohíbe (`Returning joint promise is currently prohibited`). Ahora cada transferencia es una promesa independiente
   y las funciones no devuelven nada.

## Probar

```bash
cd contracts/escrow
cargo test                                                # 24 tests
cargo build --release --target wasm32-unknown-unknown     # requiere: rustup target add wasm32-unknown-unknown

# Validación contra la testnet real con cuentas descartables (ver tools/testnet/README.md)
cd ../../tools/testnet && npm install && npx tsx cycle.ts
```
