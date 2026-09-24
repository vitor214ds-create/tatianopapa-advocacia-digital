import { chromium } from "playwright";

const BASE = "https://tatianopapa-advocacia-digital-production-b13f.up.railway.app";
const expected = (process.env.GITHUB_SHA || "").slice(0, 12);
const org = "smoke-org-12345678";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForRelease() {
  const deadline = Date.now() + 10 * 60 * 1000;
  let last = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health?smoke=${Date.now()}`, {
        headers: { "cache-control": "no-cache" },
      });
      const data = await response.json();
      last = data;
      if (response.ok && data.ok && (!expected || data.release === expected)) {
        console.log("Production release ready:", data);
        return;
      }
    } catch (error) {
      last = String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }

  throw new Error(`Production did not reach release ${expected}. Last health: ${JSON.stringify(last)}`);
}

async function waitForHydration(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.zapflowClient === "ready",
    undefined,
    { timeout: 20_000 },
  );
}

function installDiagnostics(page, label) {
  const errors = [];
  page.on("pageerror", error => errors.push(`[${label}] pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`[${label}] console: ${message.text()}`);
  });
  return errors;
}

async function testLogin(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = installDiagnostics(page, "login");
  let loginPost = false;

  await page.route("**/api/auth", async route => {
    if (route.request().method() === "POST") {
      loginPost = true;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "E-mail ou senha inválidos" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${BASE}/login?smoke=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForHydration(page);

  const email = page.locator('input[type="email"]');
  const password = page.locator('input[type="password"]');
  await email.fill("smoke-test@example.invalid");
  await password.fill("not-a-real-password");

  const button = page.getByRole("button", { name: "Entrar", exact: true });
  await button.waitFor({ state: "visible" });
  assert(!(await button.isDisabled()), "Login button is disabled after hydration");

  const box = await button.boundingBox();
  assert(box, "Login button has no bounding box");
  const topmost = await page.evaluate(
    ([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return element ? { tag: element.tagName, text: element.textContent, className: element.className } : null;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  assert(topmost?.tag === "BUTTON", `Login button is covered by ${JSON.stringify(topmost)}`);

  await button.click();
  await page.waitForTimeout(500);
  assert(loginPost, "Clicking Entrar did not dispatch POST /api/auth");
  await page.getByText("E-mail ou senha inválidos").waitFor({ state: "visible", timeout: 5_000 });

  // Ignore expected authentication GET/401 noise; JavaScript runtime errors still fail.
  const fatal = errors.filter(item => !item.includes("401"));
  assert(fatal.length === 0, fatal.join("\n"));
  console.log("PASS login interaction + hydration");
  await context.close();
}

function mockApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === "/api/auth") {
    if (request.method() === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { id: "smoke-user", email: "owner@smoke.test" },
        memberships: [{ organization_id: org, role: "owner" }],
        activeOrganizationId: org,
        authMode: "supabase",
      }),
    });
  }

  if (path === "/api/gateway") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        gatewayConfigured: true,
        gatewayBaseUrl: "https://gateway.invalid",
        accounts: [{
          id: "account-1",
          organization_id: org,
          internal_name: "WhatsApp 01",
          phone: "27999999999",
          session_id: `zapflow-${org.slice(0, 8)}-01`,
          status: "CONNECTED",
          connection_status: "CONNECTED",
          session_status: "CONNECTED",
          is_enabled: true,
        }],
      }),
    });
  }

  if (path === "/api/dashboard") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, metrics: { sent24h: 4, failed24h: 0, pending: 1, replies24h: 2 } }),
    });
  }

  if (path === "/api/campaigns") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, campaigns: [] }),
    });
  }

  if (path === "/api/templates") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ templates: [] }),
    });
  }

  return route.continue();
}

async function clickSection(page, name) {
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(200);
  const active = (await page.locator("nav button.active").textContent())?.trim();
  assert(active === name, `Expected active section ${name}, got ${active}`);
}

async function testDashboard(browser, mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const errors = installDiagnostics(page, mobile ? "mobile" : "dashboard");
  await page.route("**/api/**", mockApi);

  await page.goto(`${BASE}/?smoke=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForHydration(page);
  await page.getByText("Central de operações").waitFor({ state: "visible", timeout: 10_000 });

  if (mobile) {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.locator(".scrim").waitFor({ state: "visible" });
    await page.locator(".scrim").click();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await clickSection(page, "Campanhas");
    console.log("PASS mobile menu + scrim + Campanhas");
  } else {
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();

    await page.getByRole("button", { name: "Nova campanha", exact: true }).click();
    const activeAfterNewCampaign = (await page.locator("nav button.active").textContent())?.trim();
    assert(activeAfterNewCampaign === "Campanhas", "Dashboard Nova campanha did not open Campanhas");
    await page.getByText("Importar contatos e programar disparo").waitFor();
    await page.getByText("Criar e enfileirar campanha").waitFor();

    const contactFile = page.locator('input[type="file"]').first();
    await contactFile.setInputFiles({
      name: "contatos.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nome;telefone\nMaria;27999999999"),
    });
    await page.getByText(/1 contato\(s\) importado\(s\)/i).waitFor();
    await page.getByRole("button", { name: "Programar envio", exact: true }).click();
    const scheduleInputs = page.locator('input[type="datetime-local"]');
    await scheduleInputs.first().waitFor({ state: "visible" });
    assert(await scheduleInputs.count() === 2, "Expected start and end scheduling inputs");
    await page.getByText(/round-robin/i).waitFor({ state: "visible" });
    console.log("PASS campaign TXT/CSV import + round-robin schedule window controls");

    await clickSection(page, "Templates");
    const newTemplate = page.getByRole("button", { name: /Novo template/i }).first();
    if (await newTemplate.count()) {
      await newTemplate.click();
      await page.getByText(/Criar template|Novo template/i).first().waitFor();
    }

    await clickSection(page, "WhatsApp");

    await clickSection(page, "Dashboard");
    await page.getByText("Central de operações").waitFor();

    await page.getByRole("button", { name: "Gerenciar", exact: true }).click();
    const activeAfterManage = (await page.locator("nav button.active").textContent())?.trim();
    assert(activeAfterManage === "WhatsApp", "Gerenciar did not open WhatsApp");
    console.log("PASS dashboard navigation + action buttons");
  }

  assert(errors.length === 0, errors.join("\n"));
  await context.close();
}

await waitForRelease();
const browser = await chromium.launch({ headless: true });
try {
  await testLogin(browser);
  await testDashboard(browser, false);
  await testDashboard(browser, true);
  console.log("ALL PRODUCTION INTERACTION SMOKE TESTS PASSED");
} finally {
  await browser.close();
}
