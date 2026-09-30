import { serverFetch } from "../server-fetch";
import { runtimeEnv, supabasePublicConfig } from "../runtime-env";
import { normalizeEvolutionBaseUrl, type EvolutionConfig } from "./evolution";
function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);

  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("zapflow_access_token="));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

export function getSupabaseConfig(request: Request) {
  const { url, key } = supabasePublicConfig();
  const token = accessToken(request);
  if (!token) throw new Response("Não autenticado", { status: 401 });

  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function environmentGatewayConfig(): EvolutionConfig | null {
  const baseUrl = normalizeEvolutionBaseUrl(runtimeEnv("EVOLUTION_API_URL"));
  const apiKey = runtimeEnv("EVOLUTION_API_KEY")?.trim();
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}


export async function getOrganizationGatewayConfig(request: Request, organizationId: string): Promise<EvolutionConfig | null> {
  const { url, headers } = getSupabaseConfig(request);
  const response = await serverFetch(`${url}/rest/v1/rpc/get_evolution_gateway_config`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_organization_id: organizationId }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Falha ao carregar gateway da organização", response.status, detail);
    throw new Error("Não foi possível carregar a configuração da Evolution");
  }

  const rows = await response.json() as Array<{ base_url?: string | null; api_key?: string | null }>;
  const row = rows[0];
  const normalizedUrl = normalizeEvolutionBaseUrl(row?.base_url);
  if (normalizedUrl && row?.api_key) {
    return { baseUrl: normalizedUrl, apiKey: row.api_key };
  }

  // Sem configuração específica no Vault, usa a configuração global do Railway.
  return environmentGatewayConfig();
}

export async function getOrganizationWebhookSecret(request: Request, organizationId: string) {
  const { url, headers } = getSupabaseConfig(request);
  const response = await serverFetch(`${url}/rest/v1/rpc/get_or_create_evolution_webhook_secret`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_organization_id: organizationId }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Falha ao obter segredo de webhook Evolution", response.status, detail);
    throw new Error("Não foi possível preparar o webhook da Evolution");
  }
  const secret = await response.json() as string;
  if (!secret) throw new Error("Webhook da Evolution não retornou segredo");
  return secret;
}
