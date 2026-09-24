import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "https://tatianopapa-advocacia-digital-production-b13f.up.railway.app";
const expected = (process.env.GITHUB_SHA || "").slice(0, 12);
const org = "smoke-org-12345678";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForRelease() {
  const deadline = Date.now() + (process.env.BASE_URL ? 30_000 : 600_000);
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
      const data = await response.json();
      last = data;
      if (response.ok && data.ok && (process.env.BASE_URL || !expected || data.release === expected)) {
        console.log("Release ready:", data.release);
        return;
      }
    } catch (error) { last = String(error); }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Release ${expected} not ready: ${JSON.stringify(last)}`);
}

function mockApi() {
  const state = {
    authFailure: false, metricsFailure: false, signedIn: true,
    gatewayGets: 0, gatewayStatuses: 0, qrDelay: 0, configured: true,
    templates: [], campaigns: [], lastCampaign: null, gatewaySaves: 0,
    accounts: [{ id: "account-1", internal_name: "WhatsApp 01", session_id: `zapflow-${org.slice(0, 8)}-01`, connection_status: "CONNECTED", is_enabled: true }],
  };
  const handler = async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : {};
    const reply = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/api/auth") {
      if (req.method() === "POST") {
        if (body.action === "logout") { state.signedIn = false; return reply({ ok: true }); }
        return reply({ error: "E-mail ou senha inválidos" }, 401);
      }
      if (state.authFailure) return reply({ error: "Serviço temporariamente indisponível" }, 503);
      if (!state.signedIn) return reply({ authenticated: false }, 401);
      return reply({ authenticated: true, user: { id: "smoke-user", email: "owner@smoke.test" }, memberships: [{ organization_id: org, role: "owner" }], activeOrganizationId: org });
    }
    if (path === "/api/dashboard") return state.metricsFailure
      ? reply({ error: "Não foi possível consultar os indicadores" }, 503)
      : reply({ ok: true, metrics: { sent24h: 4, failed24h: 0, pending: 1, replies24h: 2 } });
    if (path === "/api/gateway") {
      if (req.method() === "GET") {
        state.gatewayGets++;
        return reply({ ok: true, gatewayConfigured: state.configured, gatewayBaseUrl: "https://gateway.example.invalid", accounts: state.accounts });
      }
      if (body.action === "configure") { state.gatewaySaves++; state.configured = true; return reply({ ok: true }); }
      if (body.action === "status") { state.gatewayStatuses++; return reply({ ok: true, result: { status: "CONNECTING" } }); }
      if (body.action === "create") {
        state.accounts.push({ id: body.instanceName, session_id: body.instanceName, connection_status: "WAITING_QR", is_enabled: true });
      }
      if (body.action === "qr" || body.action === "create") {
        if (state.qrDelay) await new Promise(resolve => setTimeout(resolve, state.qrDelay));
        return reply({ ok: true, result: { qrcode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=", status: "CONNECTING" } });
      }
      if (body.action === "delete") state.accounts = state.accounts.filter(account => account.session_id !== body.instanceName);
      if (body.action === "logout") state.accounts = state.accounts.map(account => account.session_id === body.instanceName ? { ...account, connection_status: "DISCONNECTED" } : account);
      return reply({ ok: true });
    }
    if (path === "/api/templates") {
      if (req.method() === "GET") return reply({ templates: state.templates });
      if (body.action === "delete") state.templates = state.templates.filter(template => template.id !== body.id);
      else {
        const template = { ...body, id: body.id || `template-${state.templates.length + 1}`, variables: ["nome"], is_active: true };
        state.templates = [...state.templates.filter(item => item.id !== template.id), template];
        return reply({ ok: true, template });
      }
      return reply({ ok: true });
    }
    if (path === "/api/campaigns") {
      if (req.method() === "GET") return reply({ ok: true, campaigns: state.campaigns });
      state.lastCampaign = body;
      state.campaigns.push({ id: "campaign-1", name: body.name, status: "QUEUED", eligible_recipients: body.recipients.length, rejected_recipients: 0, sent_count: 0, failed_count: 0 });
      return reply({ ok: true, campaignId: "campaign-1", eligible: body.recipients.length, rejected: 0, sessions: 1 }, 201);
    }
    // Never allow a mocked interface test to send an unhandled API mutation.
    throw new Error(`Unexpected API request: ${req.method()} ${path}`);
  };
  return { state, handler };
}

async function openApp(browser, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const api = mockApi();
  await page.route("**/api/**", api.handler);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Central de operações" }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.zapflowClient === "ready");
  return { context, page, errors, ...api };
}

async function section(page, name) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
  await page.getByRole("heading", { name: name === "Dashboard" ? "Central de operações" : name === "WhatsApp" ? "Números WhatsApp" : name, exact: true }).waitFor();
}

async function testLogin(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const api = mockApi();
  api.state.signedIn = false;
  await page.route("**/api/**", api.handler);
  await page.goto(`${BASE}/login`);
  const submit = page.getByRole("button", { name: "Entrar", exact: true });
  await submit.waitFor();
  await page.getByLabel("E-mail").fill("smoke@example.invalid");
  await page.getByLabel("Senha").fill("test-only-not-a-real-credential");
  await submit.click();
  await page.getByText("E-mail ou senha inválidos", { exact: true }).waitFor();
  console.log("PASS login dispatches and displays failure");
  await context.close();
}

async function testDesktop(browser) {
  const { context, page, state, errors } = await openApp(browser);
  await page.getByRole("button", { name: "Nova campanha", exact: true }).click();
  await page.getByRole("heading", { name: "Criar campanha", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert(await page.getByRole("heading", { name: "Criar campanha", exact: true }).count() === 0, "Cancel campaign must close the form");

  await section(page, "Templates");
  await page.getByRole("button", { name: "Criar template", exact: true }).first().click();
  await page.getByRole("button", { name: "Salvar template", exact: true }).click();
  await page.getByRole("alert").getByText("Informe um nome para o template.").waitFor();
  await page.getByLabel("Nome", { exact: true }).fill("Teste interface");
  await page.getByLabel("Mensagem", { exact: true }).fill("Olá {{nome}}, tudo bem?");
  await page.getByRole("button", { name: "Salvar template", exact: true }).click();
  await page.getByRole("status").getByText("Template criado.").waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Mensagem", { exact: true }).fill("Olá {{nome}}, mensagem atualizada.");
  await page.getByRole("button", { name: "Salvar template", exact: true }).click();
  await page.getByText("Template atualizado.", { exact: true }).waitFor();
  assert(state.templates[0].content.includes("atualizada"), "Template edit must persist");

  await section(page, "Campanhas");
  await page.getByRole("button", { name: "Nova campanha", exact: true }).click();
  await page.getByLabel("Usar template").selectOption(state.templates[0].id);
  await page.getByLabel("Destinatários", { exact: true }).fill('Nome;Telefone\n"Maria, Silva";27999999999');
  await page.getByRole("button", { name: "Criar e enfileirar campanha", exact: true }).click();
  await page.getByText("Confirme que os destinatários autorizaram o recebimento das mensagens.", { exact: true }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar e enfileirar campanha", exact: true }).click();
  await page.getByText("Campanha adicionada à fila", { exact: true }).waitFor();
  assert(state.lastCampaign.recipients.length === 1, "CSV header must not become a recipient");
  assert(state.lastCampaign.recipients[0].name === "Maria, Silva", "Quoted CSV name must survive import");
  assert(state.lastCampaign.message.includes("atualizada"), "Selected template must be used");

  await section(page, "WhatsApp");
  await page.getByText("Gateway configurado", { exact: true }).waitFor();
  const before = state.gatewayGets;
  await page.waitForTimeout(1100);
  assert(state.gatewayGets - before < 3, `Session render caused a request loop: ${state.gatewayGets - before}`);
  await page.getByRole("button", { name: "Editar gateway", exact: true }).click();
  await page.getByLabel("URL da Evolution", { exact: true }).fill("https://gateway.example.invalid");
  await page.getByLabel("API key da Evolution", { exact: true }).fill("test-only-key");
  await page.getByRole("button", { name: "Salvar gateway", exact: true }).click();
  await page.getByRole("button", { name: "Editar gateway", exact: true }).waitFor();
  assert(state.gatewaySaves === 1, "Gateway configuration must be editable");

  state.qrDelay = 650;
  await page.getByRole("button", { name: "Conectar por QR", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.waitForTimeout(1000);
  assert(await page.getByRole("dialog").count() === 0, "Late QR response reopened a closed dialog");
  state.qrDelay = 0;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar novo QR", exact: true }).first().click();
  await page.getByAltText("QR Code para conectar WhatsApp").waitFor();
  await page.getByRole("button", { name: "Gerar outro QR", exact: true }).click();
  await page.getByAltText("QR Code para conectar WhatsApp").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert(await page.getByRole("dialog").count() === 0, "Escape must close QR dialog");

  await section(page, "Dashboard");
  state.metricsFailure = true;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByText("Indicadores indisponíveis", { exact: true }).waitFor();
  state.metricsFailure = false;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByText("Indicadores indisponíveis", { exact: true }).waitFor({ state: "hidden" });

  await section(page, "Templates");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByText("Template excluído.", { exact: true }).waitFor();
  assert(state.templates.length === 0, "Delete must remove template");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await page.getByRole("heading", { name: "Entrar no ZapFlow", exact: true }).waitFor();
  assert(errors.length === 0, errors.join("\n"));
  console.log("PASS desktop: campaign shortcut, template CRUD, CSV, campaign dispatch, gateway edit, polling, QR cancellation/regeneration, error recovery and logout (mock API)");
  await context.close();
}

async function testMobileAndRecovery(browser) {
  const { context, page, state, errors } = await openApp(browser, true);
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.locator(".scrim").click({ position: { x: 350, y: 400 } });
  assert(await page.locator(".scrim").count() === 0, "Backdrop must close menu");
  for (const name of ["Campanhas", "Templates", "WhatsApp", "Dashboard"]) {
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await section(page, name);
    assert(await page.locator(".scrim").count() === 0, `Menu stayed open after ${name}`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow on ${name}`);
  }
  state.authFailure = true;
  await page.reload();
  await page.getByRole("heading", { name: "Não foi possível abrir sua conta" }).waitFor();
  state.authFailure = false;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await page.getByRole("heading", { name: "Central de operações" }).waitFor();
  assert(errors.length === 0, errors.join("\n"));
  console.log("PASS mobile navigation, layout and transient-auth recovery (mock API)");
  await context.close();
}

await waitForRelease();
const browser = await chromium.launch({ headless: true });
try {
  await testLogin(browser);
  await testDesktop(browser);
  await testMobileAndRecovery(browser);
  console.log("ALL INTERACTION REGRESSIONS PASSED. Authenticated UI tests use isolated mock APIs; no WhatsApp messages are sent.");
} finally { await browser.close(); }
