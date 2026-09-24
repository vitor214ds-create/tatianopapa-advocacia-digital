import { describe, expect, test } from "bun:test";
import {
  allocateEvenly,
  normalizePhone,
  prepareRecipients,
  renderRecipientMessage,
  resolveCampaignStart,
} from "./campaign-queue-server";
import { normalizeEvolutionBaseUrl } from "./gateway/evolution";

describe("campaign recipient safety", () => {
  test("normalizes Brazilian phones", () => {
    expect(normalizePhone("(27) 99999-9999")).toBe("5527999999999");
    expect(normalizePhone("5527999999999")).toBe("5527999999999");
  });

  test("rejects duplicates, suppression and missing consent", () => {
    const result = prepareRecipients([
      { phone: "27999999999", consent: true },
      { phone: "(27) 99999-9999", consent: true },
      { phone: "27988888888", consent: false },
      { phone: "27977777777", consent: true, suppressed: true },
    ]);
    expect(result.eligible).toHaveLength(1);
    expect(result.rejected).toBe(3);
  });

  test("allocates with maximum difference of one", () => {
    const recipients = Array.from({ length: 103 }, (_, index) => ({
      normalizedPhone: `5527999${String(index).padStart(6, "0")}`,
    }));
    const sessions = Array.from({ length: 4 }, (_, index) => ({
      id: String(index + 1),
      session_id: `session-${index + 1}`,
    }));
    const allocation = allocateEvenly(recipients, sessions);
    const counts = sessions.map(
      session => allocation.filter(item => item.session.id === session.id).length,
    );
    expect(counts).toEqual([26, 26, 26, 25]);
  });
});

describe("Evolution URL hardening", () => {
  test("accepts HTTPS public origins", () => {
    expect(normalizeEvolutionBaseUrl("https://evolution.example.com")).toBe(
      "https://evolution.example.com",
    );
  });

  test("accepts Railway private HTTP and supplies port", () => {
    expect(normalizeEvolutionBaseUrl("http://evolution-api.railway.internal")).toBe(
      "http://evolution-api.railway.internal:8080",
    );
  });

  test("rejects public HTTP and private/loopback hosts", () => {
    expect(normalizeEvolutionBaseUrl("http://example.com")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://localhost")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://127.0.0.1")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://10.0.0.1")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://192.168.1.10")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://169.254.169.254")).toBeNull();
  });

  test("rejects credentials, paths and query strings", () => {
    expect(normalizeEvolutionBaseUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://example.com/api")).toBeNull();
    expect(normalizeEvolutionBaseUrl("https://example.com?x=1")).toBeNull();
  });
});


describe("campaign template rendering", () => {
  test("renders supported recipient variables", () => {
    expect(
      renderRecipientMessage(
        "Olá {{nome}}, seu telefone é {{telefone}}.",
        { phone: "27999999999", normalizedPhone: "5527999999999", consent: true, name: "Maria" },
      ),
    ).toBe("Olá Maria, seu telefone é 5527999999999.");
  });

  test("uses a safe fallback when recipient name is missing", () => {
    expect(
      renderRecipientMessage(
        "Olá {{ nome }}!",
        { phone: "27999999999", normalizedPhone: "5527999999999", consent: true },
      ),
    ).toBe("Olá cliente!");
  });

  test("rejects unsupported variables", () => {
    expect(() =>
      renderRecipientMessage(
        "Olá {{empresa}}",
        { phone: "27999999999", normalizedPhone: "5527999999999", consent: true },
      ),
    ).toThrow("Variável de template não suportada");
  });
});


describe("campaign scheduling", () => {
  test("keeps immediate campaigns at the current time", () => {
    expect(resolveCampaignStart(undefined, 1_000)).toBe(1_000);
  });

  test("uses the requested future time as the first queue release", () => {
    expect(resolveCampaignStart("2026-10-01T15:00:00.000Z", Date.parse("2026-10-01T12:00:00.000Z")))
      .toBe(Date.parse("2026-10-01T15:00:00.000Z"));
  });

  test("rejects expired and excessively distant schedules", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    expect(() => resolveCampaignStart("2026-10-01T11:00:00.000Z", now)).toThrow("já passou");
    expect(() => resolveCampaignStart("2028-10-01T12:00:00.000Z", now)).toThrow("12 meses");
  });
});
