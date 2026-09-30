import { afterEach, describe, expect, test } from "bun:test";
import { connectionPayload, createInstance, getQr, fetchInstances, normalizePairingPhone, instancePhone } from "./evolution";
import { messagePayloads } from "./webhook-payload";
import { accountLabel } from "./accounts";
const originalFetch = globalThis.fetch;
const config = { baseUrl: "https://evolution.example.com", apiKey: "test-only" };
afterEach(() => { globalThis.fetch = originalFetch; });
function mockFetch(handler: (url: string, init?: RequestInit) => Response) { globalThis.fetch = ((url: any, init?: RequestInit) => Promise.resolve(handler(String(url), init))) as typeof fetch; }
describe("WhatsApp connection", () => {
  test("accepts delayed response without treating an object as an image", () => {
    expect(connectionPayload({ qrcode: { count: 0 } }).qrcode).toBeNull();
    expect(connectionPayload({ qrcode: { base64: "a".repeat(120), pairingCode: "12345678" } }).pairingCode).toBe("12345678");
  });
  test("passes phone on initial creation and enables authenticated webhook", async () => {
    mockFetch((url, init) => { const body = JSON.parse(String(init?.body)); expect(body.number).toBe("5527999999999"); expect(body.webhook.enabled).toBe(true); expect(body.webhook.headers["x-zapflow-webhook-secret"]).toBe("test-secret"); return Response.json({ qrcode: { pairingCode: "ABCD1234" } }); });
    expect((await createInstance("session", "https://zapflow.example.com/api/gateway-webhook", config, { "x-zapflow-webhook-secret": "test-secret" }, "5527999999999")).pairingCode).toBe("ABCD1234");
  });
  test("requests pairing on the specific instance with the number query", async () => {
    mockFetch(url => { expect(url).toBe("https://evolution.example.com/instance/connect/session-2?number=5527999999999"); return Response.json({ pairingCode: "ABCD1234" }); });
    expect((await getQr("session-2", config, "5527999999999")).pairingCode).toBe("ABCD1234");
  });
  test("extracts connected phone without the device suffix and strips secrets", async () => {
    mockFetch(() => Response.json([{ name: "session-1", ownerJid: "5527999999999:12@s.whatsapp.net", connectionStatus: "open", token: "must-not-leak" }]));
    expect(await fetchInstances(config)).toEqual([{ instanceName: "session-1", phone: "5527999999999", status: "open" }]);
  });
  test("validates phone and does not mistake LID or device ID for phone digits", () => {
    expect(normalizePairingPhone("+55 (27) 99999-9999")).toBe("5527999999999");
    expect(normalizePairingPhone("bad5527999999999")).toBeNull();
    expect(normalizePairingPhone("123")).toBeNull();
    expect(instancePhone("5527999999999:12@s.whatsapp.net")).toBe("5527999999999");
  });
  test("shows human session labels", () => { expect(accountLabel({ session_id: "zapflow-12345678-01", internal_name: "zapflow-12345678-01" })).toBe("WhatsApp 1"); });
  test("does not expose upstream credentials in errors", async () => {
    mockFetch(() => Response.json({ token: "must-not-leak" }, { status: 401 }));
    await expect(getQr("session", config)).rejects.toThrow("A chave do gateway foi recusada");
  });
});
test("handles batches and unwraps ephemeral messages with millisecond timestamps", () => {
  const data = messagePayloads({ event: "messages.upsert", instance: "one", data: [{ key: { id: "a" }, messageTimestamp: 1790736000000, message: { ephemeralMessage: { message: { conversation: "Olá" } } } }, { key: { id: "b" }, message: { conversation: "Oi" } }] });
  expect(data).toHaveLength(2);
  expect(data[0]?.data.message.conversation).toBe("Olá");
  expect(data[0]?.data.messageTimestamp).toBe(1790736000);
});
