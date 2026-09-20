import { runtimeEnv } from "../runtime-env";

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

export type GatewayInstance = {
  instanceName: string;
  status?: string;
  qrcode?: string | null;
  raw?: unknown;
};

const DEFAULT_RAILWAY_EVOLUTION_URL = "http://evolution-api.railway.internal:8080";

function normalizeBaseUrl(value?: string | null) {
  let raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return null;

  const ownPrivateDomain = String(runtimeEnv("RAILWAY_PRIVATE_DOMAIN") || "")
    .trim()
    .toLowerCase();
  const hostOnly = raw
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();

  if (
    (ownPrivateDomain &&
      (hostOnly === ownPrivateDomain || hostOnly.startsWith(`${ownPrivateDomain}:`))) ||
    hostOnly.startsWith("tatianopapa-advocacia-digital.railway.internal")
  ) {
    return DEFAULT_RAILWAY_EVOLUTION_URL;
  }

  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;

  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".railway.internal") && !url.port) {
      url.port = "8080";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function hasGatewayConfig(config?: EvolutionConfig | null) {
  if (normalizeBaseUrl(config?.baseUrl) && config?.apiKey) return true;
  return Boolean(
    normalizeBaseUrl(runtimeEnv("EVOLUTION_API_URL")) &&
      runtimeEnv("EVOLUTION_API_KEY"),
  );
}

function getConfig(config?: EvolutionConfig | null): EvolutionConfig {
  const baseUrl = normalizeBaseUrl(config?.baseUrl || runtimeEnv("EVOLUTION_API_URL"));
  const apiKey = config?.apiKey || runtimeEnv("EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("Gateway Evolution ainda não configurado.");
  }
  return { baseUrl, apiKey };
}

async function evolutionFetch(
  path: string,
  init?: RequestInit,
  config?: EvolutionConfig | null,
) {
  const { baseUrl, apiKey } = getConfig(config);
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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Evolution API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
    );
  }

  return data as any;
}

export async function createInstance(
  instanceName: string,
  webhookUrl?: string,
  config?: EvolutionConfig | null,
): Promise<GatewayInstance> {
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

  const raw = await evolutionFetch(
    "/instance/create",
    { method: "POST", body: JSON.stringify(body) },
    config,
  );

  return {
    instanceName,
    qrcode: raw?.qrcode?.base64 || raw?.qrcode || raw?.base64 || null,
    status: raw?.instance?.status || raw?.status,
    raw,
  };
}

export async function getQr(
  instanceName: string,
  config?: EvolutionConfig | null,
): Promise<GatewayInstance> {
  const raw = await evolutionFetch(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    undefined,
    config,
  );
  return {
    instanceName,
    qrcode: raw?.base64 || raw?.qrcode?.base64 || raw?.qrcode || null,
    status: raw?.status,
    raw,
  };
}

export async function getConnectionState(
  instanceName: string,
  config?: EvolutionConfig | null,
): Promise<GatewayInstance> {
  const raw = await evolutionFetch(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    undefined,
    config,
  );
  return {
    instanceName,
    status: raw?.instance?.state || raw?.state || raw?.status,
    raw,
  };
}

export async function deleteInstance(
  instanceName: string,
  config?: EvolutionConfig | null,
): Promise<GatewayInstance> {
  const raw = await evolutionFetch(
    `/instance/delete/${encodeURIComponent(instanceName)}`,
    { method: "DELETE" },
    config,
  );
  return { instanceName, status: "deleted", raw };
}

export async function logoutInstance(
  instanceName: string,
  config?: EvolutionConfig | null,
): Promise<GatewayInstance> {
  const raw = await evolutionFetch(
    `/instance/logout/${encodeURIComponent(instanceName)}`,
    { method: "DELETE" },
    config,
  );
  return { instanceName, status: "logged_out", raw };
}

export async function sendText(
  instanceName: string,
  number: string,
  text: string,
  config?: EvolutionConfig | null,
) {
  return evolutionFetch(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ number, text, linkPreview: false }),
    },
    config,
  );
}
