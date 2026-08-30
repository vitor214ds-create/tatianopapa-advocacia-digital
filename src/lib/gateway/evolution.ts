import { runtimeEnv } from "../runtime-env";

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

export type GatewayInstance = {
  instanceName: string;
  status?: string;
  qrcode?: string | null;
  raw?: unknown;
};

export function hasGatewayConfig() {
  return Boolean(runtimeEnv("EVOLUTION_API_URL") && runtimeEnv("EVOLUTION_API_KEY"));
}

function getConfig(): EvolutionConfig {
  const baseUrl = runtimeEnv("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = runtimeEnv("EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("Gateway Evolution ainda não configurado no servidor.");
  }
  return { baseUrl, apiKey };
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = getConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(`Evolution API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data as any;
}

export async function createInstance(instanceName: string, webhookUrl?: string): Promise<GatewayInstance> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
    };
  }
  const raw = await evolutionFetch("/instance/create", { method: "POST", body: JSON.stringify(body) });
  return {
    instanceName,
    qrcode: raw?.qrcode?.base64 || raw?.qrcode || raw?.base64 || null,
    status: raw?.instance?.status || raw?.status,
    raw,
  };
}

export async function getQr(instanceName: string): Promise<GatewayInstance> {
  const raw = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
  return { instanceName, qrcode: raw?.base64 || raw?.qrcode?.base64 || raw?.qrcode || null, status: raw?.status, raw };
}

export async function getConnectionState(instanceName: string): Promise<GatewayInstance> {
  const raw = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  return { instanceName, status: raw?.instance?.state || raw?.state || raw?.status, raw };
}

export async function deleteInstance(instanceName: string): Promise<GatewayInstance> {
  const raw = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  return { instanceName, status: "deleted", raw };
}

export async function logoutInstance(instanceName: string): Promise<GatewayInstance> {
  const raw = await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  return { instanceName, status: "logged_out", raw };
}

export async function sendText(instanceName: string, number: string, text: string) {
  return evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text, linkPreview: false }),
  });
}
