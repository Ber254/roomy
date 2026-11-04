import { defineConfig } from "drizzle-kit";

// drizzle-kit no lee .env.local por sí solo (Next.js sí, pero esto corre fuera de Next).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // el archivo no existe: se ignora
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Falta DATABASE_URL. Creá web/.env.local con DATABASE_URL=postgresql://...",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
