import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Solo para pruebas locales: apunta el driver HTTP a tools/local-db en vez de Neon.
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL (connection string de Neon)");

export const db = drizzle(neon(url), { schema });
export * from "./schema";
