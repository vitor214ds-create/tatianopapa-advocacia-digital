import { afterEach, expect, test } from "bun:test";
import { Route as ChatRoute } from "../../routes/api.chat";
import { Route as GatewayRoute } from "../../routes/api.gateway";
import { Route as WebhookRoute } from "../../routes/api.gateway-webhook";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const thread = { id: "thread-2", whatsapp_account_id: "account-2", session_id: "zapflow-12345678-02", contact_phone: "5527999999999" };
function mockServer(handler: (url: string, init?: RequestInit) => Response) {
 globalThis.fetch = ((url: any, init?: RequestInit) => {
  const path = String(url);
  if (path.includes("/auth/v1/user")) return Promise.resolve(Response.json({ id: "user" }));
  if (path.includes("/organization_members?")) return Promise.resolve(Response.json([{ role: "owner" }]));
  if (path.includes("/get_evolution_gateway_config")) return Promise.resolve(Response.json([{ base_url: "https://evolution.example.com", api_key: "test-only" }]));
  return Promise.resolve(handler(path, init));
 }) as typeof fetch;
}
function post(route: any, body: unknown) {
 return route.options.server.handlers.POST({ request: new Request("https://zapflow.example.com/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" }, body: JSON.stringify(body) }) }) as Promise<Response>;
}
test("reply uses stored WhatsApp 2 even if browser attempts to supply WhatsApp 1", async () => {
 let sent = "";
 mockServer((url, init) => {
  if (url.includes("/zapflow_chat_threads?") && init?.method !== "PATCH") return Response.json([thread]);
  if (url.includes("/whatsapp_accounts?")) return Response.json([{ session_id: thread.session_id, connection_status: "CONNECTED", is_enabled: true }]);
  if (url.includes("/message/sendText/")) { sent = url; return Response.json({ key: { id: "provider-1" } }); }
  if (url.includes("/zapflow_chat_messages?")) return Response.json([{ id: "message", thread_id: thread.id }]);
  if (init?.method === "PATCH") return new Response(null, { status: 204 });
  throw new Error(`Unexpected request ${url}`);
 });
 const response = await post(ChatRoute, { action: "sendText", organizationId: "12345678-org", threadId: thread.id, text: "Resposta", sessionId: "zapflow-12345678-01" });
 expect(response.status).toBe(200);
 expect(sent).toEndWith("/message/sendText/zapflow-12345678-02");
});
test("disconnected sender blocks sending instead of switching to another WhatsApp", async () => {
 mockServer(url => {
  if (url.includes("/zapflow_chat_threads?")) return Response.json([thread]);
  if (url.includes("/whatsapp_accounts?")) return Response.json([{ session_id: thread.session_id, connection_status: "DISCONNECTED" }]);
  throw new Error("Unexpected outgoing request");
 });
 expect((await post(ChatRoute, { action: "sendText", organizationId: "org", threadId: thread.id, text: "Resposta" })).status).toBe(409);
});
test("new session QR response never leaks the provider raw token", async () => {
 mockServer(url => {
  if (url.includes("/whatsapp_accounts?")) return Response.json([]);
  if (url.includes("/zapflow_reserve_whatsapp_account")) return Response.json([{ account_id: "account", is_new: true }]);
  if (url.includes("/get_or_create_evolution_webhook_secret")) return Response.json("test-secret".repeat(4));
  if (url.includes("/instance/create")) return Response.json({ qrcode: { base64: "a".repeat(120) }, hash: "must-not-leak" });
  throw new Error(`Unexpected request ${url}`);
 });
 const response = await post(GatewayRoute, { action: "create", organizationId: "12345678-org", instanceName: "zapflow-12345678-01" });
 expect(response.status).toBe(200);
 const body = await response.json();
 expect(body.result.qrcode).toBe("a".repeat(120));
 expect(body.result.raw).toBeUndefined();
});
test("webhook returns retryable failure when message persistence fails", async () => {
 mockServer(url => {
  if (url.endsWith("/ingest_evolution_webhook")) return Response.json(true);
  if (url.endsWith("/zapflow_ingest_chat_message")) return Response.json({ error: "temporarily unavailable" }, { status: 503 });
  throw new Error("Unexpected request");
 });
 const response = await (WebhookRoute.options as any).server.handlers.POST({ request: new Request("https://zapflow.example.com/api/gateway-webhook", { method: "POST", headers: { "x-zapflow-organization-id": "org", "x-zapflow-webhook-secret": "s".repeat(32) }, body: JSON.stringify({ event: "messages.upsert", instance: "session", data: { key: { id: "a" }, message: { conversation: "Oi" } } }) }) });
 expect(response.status).toBe(503);
});
