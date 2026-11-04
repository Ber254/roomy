// Proxy local compatible con el protocolo SQL-over-HTTP de Neon (@neondatabase/serverless).
// Permite correr la app y sus pruebas contra un Postgres local sin cambiar el código de la app.
//
//   PG_URL=postgresql://roomy:roomy@localhost/roomy_test node proxy.mjs
//   (app)  DATABASE_URL=postgresql://roomy:roomy@localhost/roomy_test NEON_FETCH_ENDPOINT=http://localhost:4444/sql
//
// Solo para desarrollo: escucha en 127.0.0.1 y no autentica.
import http from "node:http";
import pg from "pg";

const PG_URL = process.env.PG_URL ?? "postgresql://roomy:roomy@localhost/roomy_test";
const PORT = Number(process.env.PORT ?? 4444);
const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

// El driver de Neon pide texto crudo (Neon-Raw-Text-Output) y filas como arrays: devolvemos los valores sin parsear.
const raw = { getTypeParser: () => (v) => v };

const shape = (r) => ({
  command: r.command,
  rowCount: r.rowCount,
  rows: r.rows,
  fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
  rowAsArray: true,
});
const run = (c, { query, params }) => c.query({ text: query, values: params ?? [], rowMode: "array", types: raw });

const fail = (res, e) => {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: e.message, code: e.code, detail: e.detail, severity: e.severity }));
};

http
  .createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/sql")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const c = await pool.connect();
    try {
      const data = JSON.parse(body);
      let out;
      if (Array.isArray(data.queries)) {
        // batch = transacción atómica, igual que en Neon
        await c.query("BEGIN");
        try {
          const results = [];
          for (const q of data.queries) results.push(shape(await run(c, q)));
          await c.query("COMMIT");
          out = { results };
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        }
      } else {
        out = shape(await run(c, data));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      fail(res, e);
    } finally {
      c.release();
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`neon-http proxy en http://127.0.0.1:${PORT}/sql -> ${PG_URL.replace(/:[^:@/]*@/, ":***@")}`));
