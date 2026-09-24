import { afterEach, describe, expect, test } from "bun:test";
import { Route as Auth } from "../routes/api.auth";
import { Route as Campaigns } from "../routes/api.campaigns";
import { Route as Templates } from "../routes/api.templates";
import { Route as Gateway } from "../routes/api.gateway";

type TestRoute = { options: { server: { handlers: Record<string, (context: { request: Request }) => Promise<Response>> } } };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const handler = (route: unknown, method: string, request: Request) => (route as TestRoute).options.server.handlers[method]!({ request });
const post = (path: string, value: unknown) => new Request(`https://app.example.invalid/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

describe("HTTP input validation", () => {
  for (const [name, route] of [["auth", Auth], ["campaigns", Campaigns], ["templates", Templates], ["gateway", Gateway]] as const) {
    test(`${name} rejects null, arrays and scalar JSON with 400`, async () => {
      for (const value of [null, [], 42, "invalid"]) {
        const response = await handler(route, "POST", post(name, value));
        expect(response.status).toBe(400);
        expect(response.headers.get("content-type")).toContain("application/json");
      }
    });
  }
  test("invalid campaign field types do not cause a server error", async () => {
    const response = await handler(Campaigns, "POST", post("campaigns", { organizationId: "org", name: 12, message: {}, recipients: [] }));
    expect(response.status).toBe(400);
  });
  test("protected routes still reject unsigned requests", async () => {
    for (const route of [Campaigns, Templates, Gateway]) {
      expect((await handler(route, "GET", new Request("https://app.example.invalid/api/test?organizationId=org"))).status).toBe(401);
    }
  });
});

describe("authentication outage recovery", () => {
  test("upstream outages preserve existing cookies and return 503", async () => {
    globalThis.fetch = (async () => new Response("temporarily unavailable", { status: 503 })) as typeof fetch;
    const response = await handler(Auth, "GET", new Request("https://app.example.invalid/api/auth", { headers: { cookie: "zapflow_access_token=test-token" } }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  test("an auth provider outage is not reported as a wrong password", async () => {
    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    const response = await handler(Auth, "POST", post("auth", { action: "login", email: "test@example.invalid", password: "test-only" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("indisponível");
  });
});

describe("gateway response privacy", () => {
  test("creating a session does not expose the provider's raw credential payload", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "test-user" });
      if (url.includes("/organization_members?")) return Response.json([{ role: "owner" }]);
      if (url.endsWith("/get_evolution_gateway_config")) return Response.json([{ base_url: "https://gateway.example.invalid", api_key: "test-only-secret" }]);
      if (url.includes("/whatsapp_accounts?")) return init?.method === "PATCH" ? new Response(null, { status: 204 }) : Response.json([]);
      if (url.endsWith("/zapflow_reserve_whatsapp_account")) return Response.json([{ account_id: "test-account", is_new: true }]);
      if (url.endsWith("/get_or_create_evolution_webhook_secret")) return Response.json("test-webhook-secret");
      if (url.endsWith("/instance/create")) return Response.json({ instance: { status: "connecting" }, qrcode: { base64: "test-qr" }, hash: "test-only-secret" });
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
    const request = post("gateway", { organizationId: "test-org", action: "create", instanceName: "zapflow-test-org-01" });
    request.headers.set("authorization", "Bearer test-token");
    const response = await handler(Gateway, "POST", request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("test-only-secret");
    expect(text).not.toContain('"raw"');
    expect(JSON.parse(text).result.qrcode).toBe("test-qr");
  });
});
