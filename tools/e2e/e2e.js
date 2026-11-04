// Prueba de punta a punta: 3 usuarios en navegadores distintos contra la app real y un Postgres real.
// Requisitos: ver tools/e2e/README.md. Borra TODAS las tablas de la base indicada: usar solo una base de pruebas.
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const REAL_QUOTE = process.env.E2E_REAL_QUOTE === "1"; // pide una cotización real (no dry) a 1Click para hakaroomy.near
let fails = 0;
const ok = (c, m, extra = "") => { console.log((c ? "OK   " : "FAIL ") + m + (c || !extra ? "" : "  -> " + extra)); if (!c) fails++; };
const sql = (q) => execSync(`PGPASSWORD=${process.env.E2E_PGPASSWORD ?? "roomy"} psql -h localhost -U ${process.env.E2E_PGUSER ?? "roomy"} -d ${process.env.E2E_PGDB ?? "roomy_test"} -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const norm = (s) => s.replace(/ /g, " ");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newUser = async () => {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 1400 }, locale: "es-AR" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    return { ctx, page };
  };
  const text = async (p) => norm(await p.innerText("main"));

  sql("truncate table vote_ballots, votes, chores, messages, guarantees, payments, expense_splits, expenses, members, houses cascade");
  // ---- 1. Crear casa (hospedante) ----
  const hugo = await newUser();
  await hugo.page.goto(BASE);
  await hugo.page.fill('form:has(h2:has-text("Crear una casa")) input[name=name]', "Casa del Sol");
  await hugo.page.fill('form:has(h2:has-text("Crear una casa")) input[name=displayName]', "Hugo");
  await hugo.page.click('button:has-text("Crear casa")');
  await hugo.page.waitForURL(/\/h\/[0-9a-f-]{36}/);
  const houseId = hugo.page.url().match(/\/h\/([0-9a-f-]{36})/)[1];
  const code = sql(`select invite_code from houses where id='${houseId}'`);
  ok(/^[A-Z2-9]{6}$/.test(code), "crea la casa y genera un código de invitación de 6 caracteres: " + code);
  ok(sql(`select is_host from members where house_id='${houseId}'`) === "t", "el creador queda como hospedante");

  // ---- 2. Unirse con código ----
  const join = async (name, c = code) => {
    const u = await newUser();
    await u.page.goto(BASE);
    await u.page.fill('form:has(h2:has-text("Unirme")) input[name=code]', c);
    await u.page.fill('form:has(h2:has-text("Unirme")) input[name=displayName]', name);
    await u.page.click('button:has-text("Unirme")');
    return u;
  };
  const bad = await join("Eva", "ZZZZZZ");
  await bad.page.waitForSelector("text=Código de invitación inválido");
  ok(true, "un código inexistente muestra el error y no crea miembro");
  const ana = await join("Ana");
  await ana.page.waitForURL(/\/h\//);
  const beto = await join("Beto");
  await beto.page.waitForURL(/\/h\//);
  ok(sql(`select count(*) from members where house_id='${houseId}'`) === "3", "Ana y Beto se unen con el código (3 miembros)");

  // ---- 3. Gastos y balances ----
  const addExpense = async (u, desc, amount) => {
    await u.page.goto(`${BASE}/h/${houseId}`);
    await u.page.fill("input[name=description]", desc);
    await u.page.fill("input[name=amount]", amount);
    await u.page.click('button:has-text("Agregar gasto")');
    await u.page.waitForLoadState("networkidle");
  };
  await addExpense(hugo, "Alquiler", "3.00");
  let t = await text(hugo.page);
  ok(/Hugo \(hospedante\)\s*le deben US\$ 2,00/.test(t), "Hugo pagó 3.00 entre 3: le deben 2,00");
  ok(/Ana\s*debe US\$ 1,00/.test(t) && /Beto\s*debe US\$ 1,00/.test(t), "Ana y Beto deben 1,00 cada uno");
  ok(/Ana → Hugo: US\$ 1,00/.test(t) && /Beto → Hugo: US\$ 1,00/.test(t), "deudas simplificadas hacia Hugo");
  ok(sql(`select sum(share_cents) from expense_splits`) === "300", "los splits suman exactamente el gasto (300 centavos)");

  await hugo.page.fill("input[name=description]", "Mal");
  await hugo.page.fill("input[name=amount]", "abc");
  await hugo.page.click('button:has-text("Agregar gasto")');
  await hugo.page.waitForSelector("text=Monto inválido");
  ok(true, "monto inválido rechazado con mensaje");
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  await hugo.page.fill("input[name=description]", "Sin gente");
  await hugo.page.fill("input[name=amount]", "5");
  for (const c of await hugo.page.locator('input[name=split]').all()) await c.uncheck();
  await hugo.page.click('button:has-text("Agregar gasto")');
  await hugo.page.waitForSelector("text=Elegí al menos un participante");
  ok(sql(`select count(*) from expenses where house_id='${houseId}'`) === "1", "los gastos inválidos no se guardan");

  // ---- 4. Aislamiento y autorización ----
  const stranger = await newUser();
  const r = await stranger.page.goto(`${BASE}/h/${houseId}`);
  ok(stranger.page.url() === BASE + "/", "sin cookie de miembro: redirige al inicio");
  const st = (p) => stranger.ctx.request.get(`${BASE}${p}`).then((x) => x.status());
  ok((await st(`/api/messages?houseId=${houseId}`)) === 401, "mensajes sin sesión => 401");
  ok((await st(`/api/dao/${houseId}`)) === 401, "DAO sin sesión => 401");
  ok((await st(`/api/guarantees/${houseId}/${houseId}`)) === 401, "garantías sin sesión => 401");
  ok((await stranger.ctx.request.post(`${BASE}/api/payments`, { data: { houseId, toMemberId: houseId, originAsset: "x", refundTo: "yy", dry: true } })).status() === 401, "pagos sin sesión => 401");
  ok((await stranger.page.goto(`${BASE}/h/not-a-uuid`)).status() === 404, "id inválido => 404");

  // ---- 5. Pagos con NEAR Intents (1Click real, dry y real) ----
  const members = Object.fromEntries(sql(`select display_name||':'||id from members where house_id='${houseId}'`).split("\n").map((l) => l.split(":")));
  const ORIGIN = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
  const pay = (u, dry, to = members.Hugo) => u.ctx.request.post(`${BASE}/api/payments`, { data: { houseId, toMemberId: to, originAsset: ORIGIN, refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D", dry } });
  let res = await pay(ana, true);
  ok(res.status() === 400 && /cuenta NEAR/.test((await res.json()).error), "no cotiza si el destinatario no configuró su cuenta NEAR");
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  await hugo.page.fill("input[name=nearAccount]", "Mala Cuenta");
  await hugo.page.click('button:has-text("Guardar")');
  await hugo.page.waitForSelector("text=Cuenta NEAR inválida");
  ok(true, "cuenta NEAR inválida rechazada");
  await hugo.page.fill("input[name=nearAccount]", "hakaroomy.near");
  await hugo.page.click('button:has-text("Guardar")');
  await hugo.page.waitForLoadState("networkidle");
  ok(sql(`select near_account from members where id='${members.Hugo}'`) === "hakaroomy.near", "guarda la cuenta NEAR válida");
  res = await pay(beto, true, members.Ana);
  ok(res.status() === 400 && /deuda pendiente/.test((await res.json()).error), "no se puede pagar una deuda que no existe (Beto -> Ana)");
  res = await pay(ana, true);
  const dry = await res.json();
  ok(res.status() === 200 && dry.quote && Number(dry.quote.amountOutFormatted) === 1, "cotización dry real de 1Click: recibe 1 USDC, deposita " + (dry.quote && dry.quote.amountInFormatted), JSON.stringify(dry).slice(0, 200));
  ok(sql("select count(*) from payments") === "0", "una cotización dry no crea pagos");
  let real;
  if (REAL_QUOTE) {
    res = await pay(ana, false);
    real = await res.json();
    ok(res.status() === 200 && real.payment && real.payment.depositAddress, "pago real: devuelve dirección de depósito", JSON.stringify(real).slice(0, 200));
  } else {
    // sin cotización real: se simula el pago abierto que dejaría una cotización
    sql(`insert into payments (house_id, from_member, to_member, amount_cents, status, deposit_address, quote) values ('${houseId}','${members.Ana}','${members.Hugo}',100,'pending','e2e-simulada','{"signature":"e2e"}')`);
    real = { payment: { id: sql("select id from payments") } };
    console.log("SKIP pago real (definí E2E_REAL_QUOTE=1 para pedir una cotización real a 1Click)");
  }
  ok(sql("select count(*) from payments") === "1" && sql("select status from payments") === "pending", "queda 1 pago en estado pending");
  ok(sql("select (quote->>'signature') is not null from payments") === "t", "se guarda la firma de 1Click para disputas");
  const again = await (await pay(ana, false)).json();
  ok(again.payment && again.payment.id === real.payment.id && sql("select count(*) from payments") === "1", "un segundo intento reutiliza el pago abierto (no duplica)");
  const stt = await ana.ctx.request.get(`${BASE}/api/payments/${real.payment.id}/status`);
  ok(stt.status() === 200 && (await stt.json()).payment.status === "pending", "consulta de estado sigue pending antes del depósito (1Click no conoce la dirección todavía)");
  ok((await beto.ctx.request.get(`${BASE}/api/payments/${real.payment.id}/status`)).status() === 200, "otro miembro de la casa puede ver el estado");
  ok((await stranger.ctx.request.get(`${BASE}/api/payments/${real.payment.id}/status`)).status() === 401, "un ajeno no ve el estado del pago");
  await ana.page.goto(`${BASE}/h/${houseId}`);
  ok(/Pagos[\s\S]*pendiente/.test(await text(ana.page)), "el pago aparece en la lista de Pagos");
  sql(`update payments set status='settled', settled_at=now()`);
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  t = await text(hugo.page);
  ok(/Hugo \(hospedante\)\s*le deben US\$ 1,00/.test(t) && /Ana\s*al día/.test(t), "al liquidarse el pago, Ana queda al día y a Hugo le deben 1,00");
  const debtsBlock = t.split("Para quedar a mano")[1].split("Tareas de la semana")[0].split("Fondo común")[0];
  ok(!/Ana → Hugo/.test(debtsBlock) && /Beto → Hugo: US\$ 1,00/.test(debtsBlock), "la deuda de Ana desaparece, la de Beto sigue", JSON.stringify(debtsBlock));

  // ---- 6. Chat ----
  await ana.page.goto(`${BASE}/h/${houseId}`);
  await ana.page.waitForSelector("text=Todavía no hay mensajes");
  await hugo.page.fill('input[placeholder^="Escribí un mensaje"]', "¿Quién compra el detergente?");
  await hugo.page.click('button:has-text("Enviar")');
  await ana.page.waitForSelector("text=¿Quién compra el detergente?", { timeout: 15000 });
  ok(true, "Ana recibe por polling el mensaje de Hugo (sin recargar)");
  ok(sql(`select count(*) from messages where house_id='${houseId}'`) === "1", "el mensaje se guardó una sola vez");
  const big = await ana.ctx.request.post(`${BASE}/api/messages`, { data: { houseId, text: "x".repeat(1001) } });
  ok(big.status() === 400, "mensaje de 1001 caracteres rechazado");
  const empty = await ana.ctx.request.post(`${BASE}/api/messages`, { data: { houseId, text: "   " } });
  ok(empty.status() === 400, "mensaje vacío rechazado");
  const xss = await ana.ctx.request.post(`${BASE}/api/messages`, { data: { houseId, text: "<img src=x onerror=alert(1)>" } });
  await hugo.page.waitForSelector("text=<img src=x onerror=alert(1)>", { timeout: 15000 });
  ok((await hugo.page.locator("main img").count()) === 0, "el HTML en un mensaje se muestra como texto (sin inyección)");

  // ---- 7. Tareas con turnos ----
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  for (const title of ["Cocina", "Baño"]) {
    await hugo.page.fill("form:has(input[name=title]) input[name=title]", title);
    await hugo.page.click("form:has(input[name=title]) button");
    await hugo.page.waitForLoadState("networkidle");
  }
  await hugo.page.waitForSelector("text=Baño");
  t = await text(hugo.page);
  ok(/Cocina\s*le toca a Hugo/.test(t) && /Baño\s*le toca a Ana/.test(t), "las tareas se reparten en orden: Cocina->Hugo, Baño->Ana", JSON.stringify(t.split("Tareas de la semana")[1]?.slice(0, 200)) + " DB=" + sql("select c.title||'->'||m.display_name from chores c join members m on m.id=c.assigned_to order by c.title"));
  await beto.page.goto(`${BASE}/h/${houseId}`);
  await beto.page.locator('li:has-text("Cocina") button').click();
  await beto.page.waitForSelector("text=Solo quien tiene la tarea o el hospedante");
  ok(sql("select done from chores where title='Cocina'") === "f", "Beto no puede marcar la tarea de Hugo");
  await ana.page.goto(`${BASE}/h/${houseId}`);
  await ana.page.locator('li:has-text("Baño") button').click();
  await ana.page.waitForLoadState("networkidle");
  ok(sql("select done from chores where title='Baño'") === "t", "Ana marca su propia tarea como hecha");
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  await hugo.page.locator('li:has-text("Baño") button').click();
  await hugo.page.waitForLoadState("networkidle");
  ok(sql("select done from chores where title='Baño'") === "f", "el hospedante puede deshacer la tarea de otro");
  ok((await hugo.page.locator('button:has-text("Pasar a esta semana")').count()) === 0, "sin semana anterior no ofrece rotar");
  sql(`update chores set week_start = week_start - interval '7 days'`);
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  await hugo.page.click('button:has-text("Pasar a esta semana")');
  await hugo.page.waitForLoadState("networkidle");
  t = await text(hugo.page);
  ok(/Cocina\s*le toca a Ana/.test(t) && /Baño\s*le toca a Beto/.test(t), "al rotar: Cocina->Ana, Baño->Beto");
  ok(sql("select count(*) from chores") === "4", "la semana anterior se conserva (4 filas)");
  await hugo.page.reload();
  ok((await hugo.page.locator('button:has-text("Pasar a esta semana")').count()) === 0, "no se puede rotar dos veces");

  // ---- 8. DAO y garantías (RPC de NEAR no alcanzable desde este entorno) ----
  res = await hugo.ctx.request.get(`${BASE}/api/dao/${houseId}`);
  ok(res.status() === 200 && (await res.json()).dao === null, "DAO: sin DAO registrado devuelve dao:null");
  res = await ana.ctx.request.post(`${BASE}/api/dao`, { data: { houseId, daoAccount: "casa-del-sol.sputnikv2.testnet" } });
  ok(res.status() === 403, "DAO: un roomie que no es hospedante no puede registrarlo");
  res = await hugo.ctx.request.post(`${BASE}/api/dao`, { data: { houseId, daoAccount: "evil.near" } });
  ok(res.status() === 400, "DAO: rechaza cuentas que no son del factory");
  res = await hugo.ctx.request.post(`${BASE}/api/dao`, { data: { houseId, daoAccount: "casa-del-sol.sputnikv2.testnet" } });
  ok(res.status() === 502 && /No se pudo verificar/.test((await res.json()).error), "DAO: si no puede verificar on-chain, no registra (502 controlado)");
  ok(sql(`select dao_account is null from houses where id='${houseId}'`) === "t", "DAO: la casa sigue sin DAO registrado");
  res = await ana.ctx.request.get(`${BASE}/api/guarantees/${houseId}/${members.Ana}`);
  ok(res.status() === 502, "garantías: RPC inalcanzable => 502 controlado, no un crash");
  await ana.page.goto(`${BASE}/h/${houseId}`);
  await ana.page.waitForSelector("text=Fondo común y votaciones");
  ok(true, "la página de la casa carga completa con DAO y garantías sin RPC");

  // ---- 9. Idioma y tema ----
  await hugo.page.goto(`${BASE}/h/${houseId}`);
  ok((await hugo.page.locator("html").getAttribute("lang")) === "es", "el idioma por defecto del navegador es-AR es español");
  await hugo.page.click('button[aria-pressed="false"]:has-text("en")');
  await hugo.page.waitForSelector("text=House chat");
  t = await text(hugo.page);
  ok(/Accounts/.test(t) && /To settle up/.test(t) && /This week's chores/.test(t), "al elegir EN, el panel de la casa pasa a inglés");
  ok(/US\$|\$/.test(t) && /is owed \$1\.00/.test(t), "los montos usan el formato de EE. UU. ($1.00)");
  ok((await hugo.page.locator("html").getAttribute("lang")) === "en", "el atributo lang de la página cambia a en");
  await hugo.page.reload();
  ok((await hugo.page.locator("html").getAttribute("lang")) === "en", "la elección de idioma persiste (cookie)");
  const cookies = await hugo.ctx.cookies();
  ok(cookies.some((c) => c.name === "roomy_locale" && c.value === "en"), "se guarda la cookie roomy_locale");
  const enErr = await hugo.ctx.request.post(`${BASE}/api/messages`, { data: { houseId, text: "   " }, headers: { "Accept-Language": "en-US" } });
  ok(/empty or too long/.test((await enErr.json()).error), "los errores de la API respetan el idioma elegido (cookie en)");
  await hugo.page.goto(BASE + "/");
  await hugo.page.waitForSelector("text=Create a house");
  ok(/Share your place without arguing\. Get organized!/.test(await text(hugo.page)), "landing en inglés con el título nuevo");
  await hugo.page.click('button[aria-pressed="false"]:has-text("es")');
  await hugo.page.waitForSelector("text=Crear una casa");
  ok(/Compartir un piso sin discutir\. ¡Organizate!/.test(await text(hugo.page)), "landing en español con el título pedido");
  const themeOf = () => hugo.page.locator("html").getAttribute("data-theme");
  const before = await themeOf();
  await hugo.page.click('button[aria-label^="Cambiar a tema"]');
  await hugo.page.waitForFunction((b) => document.documentElement.getAttribute("data-theme") !== b, before);
  const after = await themeOf();
  ok(["light", "dark"].includes(before) && ["light", "dark"].includes(after) && before !== after, `el botón alterna el tema: ${before} -> ${after}`);
  await hugo.page.reload();
  ok((await themeOf()) === after, "la elección de tema persiste al recargar");

  ok(errors.length === 0, "sin errores de JavaScript en ningún navegador", JSON.stringify(errors.slice(0, 3)));
  await browser.close();
  console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLO(S)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("EXCEPCIÓN", e.message); process.exit(2); });
