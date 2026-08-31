import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import {
  createInstance,
  deleteInstance,
  getConnectionState,
  getQr,
  hasGatewayConfig,
  logoutInstance,
  type EvolutionConfig,
} from "../lib/gateway/evolution";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

function cookieToken(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const value = part.trim();
    const index = value.indexOf("=");
    if (index !== -1 && value.slice(0, index) === "zapflow_access_token") {
      return decodeURIComponent(value.slice(index + 1));
    }
  }
  return null;
}

function getSupabaseConfig(request: Request) {
  const { url, key } = supabasePublicConfig();
  const header = request.headers.get("authorization");
  const cookie = cookieToken(request);
  const authorization = header?.startsWith("Bearer ") ? header : cookie ? `Bearer ${cookie}` : null;
  if (!authorization) throw new Response("Não autenticado", { status: 401 });
  return {
    url,
    headers: {
      apikey: key,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}

function environmentGatewayConfig(): EvolutionConfig | null {
  const baseUrl = runtimeEnv("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = runtimeEnv("EVOLUTION_API_KEY");
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

async function getOrganizationGatewayConfig(request: Request, organizationId: string): Promise<EvolutionConfig | null> {
  const { url, headers } = getSupabaseConfig(request);
  const response = await fetch(`${url}/rest/v1/rpc/get_evolution_gateway_config`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_organization_id: organizationId }),
  });

  if (response.ok) {
    const rows = await response.json() as Array<{ base_url?: string | null; api_key?: string | null }>;
    const row = rows[0];
    if (row?.base_url && row?.api_key) {
      return { baseUrl: row.base_url.replace(/\/$/, ""), apiKey: row.api_key };
    }
  }

  // Railway can inject these from the Evolution service through Reference Variables.
  // Vault remains preferred when an organization-specific config exists.
  return environmentGatewayConfig();
}

async function saveOrganizationGatewayConfig(request: Request, organizationId: string, baseUrl: string, apiKey: string) {
  const { url, headers } = getSupabaseConfig(request);
  const response = await fetch(`${url}/rest/v1/rpc/set_evolution_gateway_config`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_organization_id: organizationId, p_base_url: baseUrl, p_api_key: apiKey }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Não foi possível salvar o gateway: ${detail}`);
  }
}

async function listAccounts(request: Request, organizationId: string) {
  const { url, headers } = getSupabaseConfig(request);
  const select = encodeURIComponent("id,internal_name,phone,session_id,status,connection_status,session_status,distribution_weight,weight,is_enabled,reconnect_required,last_seen_at,connected_at,qr_expires_at,created_at,updated_at");
  const response = await fetch(`${url}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&order=created_at.asc`, { headers });
  if (!response.ok) throw new Error(`Falha ao carregar sessões: ${await response.text()}`);
  return await response.json() as any[];
}

async function saveAccount(request: Request, organizationId: string, instanceName: string, status: string) {
  const { url, headers } = getSupabaseConfig(request);
  const existingResponse = await fetch(`${url}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&session_id=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`, { headers });
  const existing = existingResponse.ok ? await existingResponse.json() as { id: string }[] : [];
  const payload = {
    organization_id: organizationId,
    internal_name: instanceName,
    provider: "evolution_baileys",
    session_id: instanceName,
    status,
    connection_status: status,
    session_status: status,
    reconnect_required: false,
    is_enabled: true,
    last_seen_at: new Date().toISOString(),
  };

  if (existing[0]) {
    const response = await fetch(`${url}/rest/v1/whatsapp_accounts?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Falha ao atualizar sessão no banco: ${await response.text()}`);
    return (await response.json() as unknown[])[0];
  }

  const response = await fetch(`${url}/rest/v1/whatsapp_accounts`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Falha ao registrar sessão no banco: ${await response.text()}`);
  return (await response.json() as unknown[])[0];
}

async function patchAccount(request: Request, organizationId: string, instanceName: string, patch: Record<string, unknown>) {
  const { url, headers } = getSupabaseConfig(request);
  const response = await fetch(`${url}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&session_id=eq.${encodeURIComponent(instanceName)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar sessão: ${await response.text()}`);
}

export const Route = createFileRoute("/api/gateway")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const organizationId = new URL(request.url).searchParams.get("organizationId");
          if (!organizationId) return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          const user = await authorizeOrganization(request, organizationId);
          requireAdmin(user);
          const gatewayConfig = await getOrganizationGatewayConfig(request, organizationId);
          return Response.json({
            ok: true,
            gatewayConfigured: hasGatewayConfig(gatewayConfig),
            gatewayBaseUrl: gatewayConfig?.baseUrl || null,
            accounts: await listAccounts(request, organizationId),
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado ao listar sessões" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            action?: "configure" | "create" | "qr" | "status" | "logout" | "delete";
            organizationId?: string;
            instanceName?: string;
            baseUrl?: string;
            apiKey?: string;
          };

          if (!body.organizationId || !body.action) {
            return Response.json({ error: "organizationId e action são obrigatórios" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);

          if (body.action === "configure") {
            if (!body.baseUrl || !body.apiKey) {
              return Response.json({ error: "URL HTTPS e API key da Evolution são obrigatórias" }, { status: 400 });
            }
            await saveOrganizationGatewayConfig(request, body.organizationId, body.baseUrl, body.apiKey);
            const saved = await getOrganizationGatewayConfig(request, body.organizationId);
            return Response.json({ ok: true, gatewayConfigured: hasGatewayConfig(saved), gatewayBaseUrl: saved?.baseUrl || null });
          }

          if (!body.instanceName) {
            return Response.json({ error: "instanceName é obrigatório" }, { status: 400 });
          }

          const gatewayConfig = await getOrganizationGatewayConfig(request, body.organizationId);
          if (!hasGatewayConfig(gatewayConfig)) {
            return Response.json({ error: "Gateway Evolution ainda não configurado.", code: "GATEWAY_NOT_CONFIGURED" }, { status: 503 });
          }

          const safeName = body.instanceName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
          let result;
          let account: unknown = null;

          switch (body.action) {
            case "create": {
              const accounts = await listAccounts(request, body.organizationId);
              const exists = accounts.some(item => item.session_id === safeName);
              if (!exists && accounts.length >= 10) {
                return Response.json({ error: "Limite de 10 sessões WhatsApp por organização atingido" }, { status: 409 });
              }
              const origin = new URL(request.url).origin;
              const webhookSecret = runtimeEnv("GATEWAY_WEBHOOK_SECRET");
              result = await createInstance(
                safeName,
                webhookSecret ? `${origin}/api/gateway-webhook?secret=${encodeURIComponent(webhookSecret)}` : undefined,
                gatewayConfig,
              );
              account = await saveAccount(request, body.organizationId, safeName, "CONNECTING");
              break;
            }
            case "qr":
              result = await getQr(safeName, gatewayConfig);
              await patchAccount(request, body.organizationId, safeName, {
                session_status: "WAITING_QR",
                connection_status: "WAITING_QR",
                qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
              });
              break;
            case "status": {
              result = await getConnectionState(safeName, gatewayConfig);
              const rawState = String(result.status || "").toUpperCase();
              const normalized = rawState.includes("OPEN") || rawState.includes("CONNECTED")
                ? "CONNECTED"
                : rawState.includes("CONNECTING") ? "CONNECTING" : "DISCONNECTED";
              await patchAccount(request, body.organizationId, safeName, {
                session_status: normalized,
                connection_status: normalized,
                reconnect_required: normalized === "DISCONNECTED",
                last_seen_at: new Date().toISOString(),
                connected_at: normalized === "CONNECTED" ? new Date().toISOString() : null,
              });
              break;
            }
            case "logout":
              result = await logoutInstance(safeName, gatewayConfig);
              await patchAccount(request, body.organizationId, safeName, {
                session_status: "DISCONNECTED",
                connection_status: "DISCONNECTED",
                reconnect_required: true,
              });
              break;
            case "delete": {
              result = await deleteInstance(safeName, gatewayConfig);
              const { url, headers } = getSupabaseConfig(request);
              await fetch(`${url}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(body.organizationId)}&session_id=eq.${encodeURIComponent(safeName)}`, {
                method: "DELETE",
                headers,
              });
              break;
            }
          }

          return Response.json({ ok: true, result, account });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no gateway" }, { status: 500 });
        }
      },
    },
  },
});
