import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Solo para pruebas locales: apunta el driver HTTP a tools/local-db en vez de Neon.
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

type Db = ReturnType<typeof drizzle<typeof schema>>;
let instance: Db | null = null;

// Se conecta en el primer uso, no al importar el módulo: así `next build` no necesita
// DATABASE_URL (Next importa las rutas al recolectar datos de página) y la falta de la
// variable en runtime sigue fallando con el mismo mensaje claro.
function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL (connection string de Neon)");
    instance = drizzle(neon(url), { schema });
  }
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb();
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
export * from "./schema";
