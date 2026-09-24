import { afterEach, describe, expect, test } from "bun:test";
import { accountConnected, getAuthState, listTemplates, qrImageSource } from "./zapflow-api";
import { parseRecipientText } from "./recipient-import";
import { cookieValue } from "./request-utils";
import { normalizePhone, renderRecipientMessage } from "./campaign-queue-server";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function mockFetch(fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = fn as typeof fetch;
}

const auth = { authenticated: true, user: { id: "test", email: null }, memberships: [], activeOrganizationId: "org" };

describe("API failures and session renewal", () => {
  test("parallel expired requests share one refresh and retry once", async () => {
    let refreshes = 0;
    let authenticated = false;
    mockFetch(async input => {
      if (String(input) === "/api/auth") {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 10));
        authenticated = true;
        return Response.json(auth);
      }
      return authenticated ? Response.json({ templates: [] }) : new Response("Sessão expirada", { status: 401 });
    });
    const results = await Promise.all([listTemplates("org"), listTemplates("org"), listTemplates("org")]);
    expect(refreshes).toBe(1);
    expect(results.every(value => Array.isArray(value.templates))).toBe(true);
  });

  test("does not treat an HTML fallback as successful data", async () => {
    mockFetch(async () => new Response("<!doctype html><html></html>"));
    await expect(listTemplates("org")).rejects.toThrow("resposta inválida");
  });

  test("shows a plain-text authorization error instead of hiding it", async () => {
    mockFetch(async () => new Response("Ação restrita a Owner/Admin", { status: 403 }));
    await expect(listTemplates("org")).rejects.toThrow("Ação restrita a Owner/Admin");
  });

  test("does not report a service outage as an expired session", async () => {
    mockFetch(async () => Response.json({ error: "Autenticação indisponível" }, { status: 503 }));
    await expect(getAuthState()).rejects.toMatchObject({ status: 503 });
  });
});

describe("campaign import and recipient eligibility", () => {
  test("imports quoted CSV headers in either column order", () => {
    expect(parseRecipientText('\uFEFFtelefone,nome\n27999999999,"Maria, Silva"', true)).toEqual([{ phone: "27999999999", name: "Maria, Silva", consent: true }]);
    expect(parseRecipientText('Nome;Telefone\nJoão;27988888888', true)).toEqual([{ phone: "27988888888", name: "João", consent: true }]);
  });
  test("keeps a blank phone invalid instead of treating a name as a number", () => {
    expect(parseRecipientText('Maria;\n;27999999999', false)).toEqual([{ name: "Maria", phone: "", consent: false }, { phone: "27999999999", consent: false }]);
  });
  test("imports simple TXT without dropping its first recipient", () => {
    expect(parseRecipientText('27999999999\r\n\r\nJoão;27988888888', true)).toHaveLength(2);
  });
  test("local Brazilian area code 55 is not mistaken for the country code", () => {
    expect(normalizePhone("(55) 99999-9999")).toBe("5555999999999");
    expect(normalizePhone("5555999999999")).toBe("5555999999999");
  });
  test("personalization treats recipient names literally", () => {
    expect(renderRecipientMessage("Olá {{nome}}", { name: "Maria $&", phone: "27999999999", normalizedPhone: "5527999999999", consent: true })).toBe("Olá Maria $&");
  });
  test("disabled and stale sessions do not enter the distribution preview", () => {
    expect(accountConnected({ id: "1", session_id: "1", connection_status: "CONNECTED", is_enabled: false })).toBe(false);
    expect(accountConnected({ id: "1", session_id: "1", connection_status: "CONNECTED", reconnect_required: true })).toBe(false);
    expect(accountConnected({ id: "1", session_id: "1", connection_status: "CONNECTED", is_enabled: true })).toBe(true);
  });
});

describe("recovery input robustness", () => {
  test("malformed cookies do not crash authentication", () => {
    expect(cookieValue(new Request("https://example.test", { headers: { cookie: "zapflow_access_token=%invalid" } }), "zapflow_access_token")).toBeNull();
  });
  test("an unexpected QR object does not crash the modal", () => {
    expect(qrImageSource({ code: "pending" } as unknown as string)).toBeNull();
    expect(qrImageSource("not-a-qr")).toBeNull();
  });
});
