import { runtimeEnv } from "../runtime-env";

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

export type GatewayInstance = {
  instanceName: string;
  status?: string;
  qrcode?: string | null;
  pairingCode?: string | null;
  qrCodeText?: string | null;
  phone?: string | null;
  raw?: unknown;
};

const DEFAULT_RAILWAY_EVOLUTION_URL = "http://evolution-api.railway.internal:8080";

export function normalizeEvolutionBaseUrl(value?: string | null) {
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

  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (url.username || url.password || url.search || url.hash) return null;

    const railwayPrivate = host.endsWith(".railway.internal");
    if (railwayPrivate) {
      if (url.protocol !== "http:") return null;
      if (!url.port) url.port = "8080";
      return url.origin;
    }

    if (url.protocol !== "https:") return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;

    if (
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost") ||
      host === "metadata.google.internal" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^(fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/i.test(host)
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function hasGatewayConfig(config?: EvolutionConfig | null) {
  if (normalizeEvolutionBaseUrl(config?.baseUrl) && config?.apiKey) return true;
  return Boolean(
    normalizeEvolutionBaseUrl(runtimeEnv("EVOLUTION_API_URL")) &&
      runtimeEnv("EVOLUTION_API_KEY"),
  );
}

function getConfig(config?: EvolutionConfig | null): EvolutionConfig {
  const baseUrl = normalizeEvolutionBaseUrl(config?.baseUrl || runtimeEnv("EVOLUTION_API_URL"));
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
    signal: init?.signal ?? AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(init?.headers || {}),
    },
  }).catch(() => {
    throw new Error(
      "Não foi possível alcançar a Evolution API. Verifique se o servidor está online e se o endereço e a porta estão corretos.",
    );
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
      `Evolution API ${response.status}: ${
        response.status === 401 || response.status === 403
          ? "A chave do gateway foi recusada. Revise a configuração."
          : response.status === 404
            ? "Sessão não encontrada no gateway."
            : response.status === 429
              ? "Muitas solicitações. Aguarde alguns segundos."
              : "O gateway não conseguiu concluir a operação."
      }`,
    );
  }

  return data as any;
}

export async function createInstance(
  instanceName: string,
  webhookUrl?: string,
  config?: EvolutionConfig | null,
  webhookHeaders?: Record<string, string>,
  number?: string,
): Promise<GatewayInstance> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    ...(number ? { number } : {}),
    integration: "WHATSAPP-BAILEYS",
  };

  if (webhookUrl) {
    body.webhook = {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      headers: webhookHeaders,
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
    ...connectionPayload(raw),
    status: raw?.instance?.status || raw?.instance?.state || raw?.state || raw?.status,
    raw,
  };
}

export async function getQr(
  instanceName: string,
  config?: EvolutionConfig | null,
  number?: string,
): Promise<GatewayInstance> {
  const raw = await evolutionFetch(
    `/instance/connect/${encodeURIComponent(instanceName)}${number ? `?number=${encodeURIComponent(number)}` : ""}`,
    undefined,
    config,
  );
  return {
    instanceName,
    ...connectionPayload(raw),
    status: raw?.instance?.state || raw?.instance?.status || raw?.state || raw?.status,
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
    status: raw?.instance?.state || raw?.instance?.status || raw?.state || raw?.status,
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

export async function sendWhatsAppAudio(
  instanceName: string,
  number: string,
  audioBase64: string,
  config?: EvolutionConfig | null,
) {
  return evolutionFetch(
    `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ number, audio: audioBase64 }),
    },
    config,
  );
}

export async function getMediaBase64(
  instanceName: string,
  message: {
    key: {
      id: string;
      remoteJid: string;
      fromMe: boolean;
    };
  },
  config?: EvolutionConfig | null,
) {
  return evolutionFetch(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
    config,
  );
}

export async function setInstanceWebhook(
  instanceName: string,
  webhookUrl: string,
  webhookHeaders: Record<string, string>,
  config?: EvolutionConfig | null,
) {
  return evolutionFetch(
    `/webhook/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          headers: webhookHeaders,
          events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
        },
      }),
    },
    config,
  );
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function imageQr(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(text)) return text;
  if (text.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(text)) return text.replace(/\s/g, "");
  return null;
}

function rawQrCode(value: unknown) {
  const text = asString(value);
  if (!text || imageQr(text)) return null;
  // Evolution/Baileys QR payloads are long strings, commonly beginning with "2@".
  return text.length >= 20 ? text : null;
}

export function connectionPayload(raw: any) {
  const data = raw?.data && typeof raw.data === "object" ? raw.data : null;
  const imageCandidates = [
    raw?.base64,
    raw?.qrcode?.base64,
    typeof raw?.qrcode === "string" ? raw.qrcode : null,
    data?.base64,
    data?.Qrcode,
    data?.qrcode?.base64,
    typeof data?.qrcode === "string" ? data.qrcode : null,
  ];
  const codeCandidates = [
    raw?.code,
    raw?.qrcode?.code,
    data?.Code,
    data?.code,
    data?.qrcode?.code,
  ];

  const pairingCode =
    asString(raw?.pairingCode) ||
    asString(raw?.qrcode?.pairingCode) ||
    asString(data?.pairingCode) ||
    asString(data?.qrcode?.pairingCode);

  return {
    qrcode: imageCandidates.map(imageQr).find(Boolean) || null,
    pairingCode,
    qrCodeText: codeCandidates.map(rawQrCode).find(Boolean) || null,
  };
}

export function normalizePairingPhone(value: unknown) {
  if (typeof value !== "string" || /[^+\d\s().-]/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

export function instancePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const at = normalized.indexOf("@");
  if (at >= 0) {
    const domain = normalized.slice(at + 1).toLowerCase();
    if (domain !== "s.whatsapp.net" && domain !== "c.us") return null;
  }
  const digits = normalized.split("@")[0].split(":")[0].replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export async function fetchInstances(config?: EvolutionConfig | null) {
  const raw = await evolutionFetch("/instance/fetchInstances", undefined, config);
  if (!Array.isArray(raw)) throw new Error("O gateway retornou uma lista de sessões inválida.");

  return raw.map(item => {
    const instance = item?.instance || item;
    const ownerCandidate =
      instance?.ownerJid ||
      instance?.owner?.jid ||
      instance?.owner ||
      instance?.number ||
      item?.ownerJid ||
      item?.number;

    return {
      instanceName: instance?.instanceName || instance?.name,
      status:
        instance?.connectionStatus ||
        instance?.state ||
        instance?.status ||
        item?.connectionStatus ||
        item?.state ||
        item?.status,
      phone: instancePhone(ownerCandidate),
    } as GatewayInstance;
  });
}
