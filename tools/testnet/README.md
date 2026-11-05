# Validación contra la testnet real

`cycle.ts` crea **cuentas descartables de testnet** (claves generadas en memoria; nunca se guardan ni se imprimen) con el
servicio gratuito que usa `near-cli-rs` (`helper.nearprotocol.com`), despliega el contrato escrow y corre:

- **Escrow:** crear, fondear (monto exacto), proponer, aceptar, ejecutar (con saldos exactos del inquilino y del treasury),
  devolución parcial, devolución unilateral del arrendador, y los casos que deben fallar (ajenos, doble ejecución, etc.).
- **DAO (Sputnik v2):** crear el DAO con la política de la casa, aportar al fondo, proponer y votar una decisión, aprobar un
  pago del fondo (saldo exacto del destinatario), rechazar una propuesta, y sumar un roomie al consejo.

Usa **los mismos constructores de transacciones que la app** (`web/src/lib`), no una copia.

```bash
cd tools/testnet
npm install
NODE_USE_ENV_PROXY=1 npx tsx cycle.ts      # el flag solo hace falta detrás de un proxy
```

Tarda varios minutos (cada transacción real tarda unos segundos). Solo testnet: las cuentas no tienen valor.
Requiere el `.wasm` compilado: `cd contracts/escrow && cargo build --release --target wasm32-unknown-unknown`.
