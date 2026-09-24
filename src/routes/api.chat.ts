import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization } from "../lib/server-auth";
import {
  getMediaBase64,
  normalizeEvolutionBaseUrl,
  sendText,
  sendWhatsAppAudio,
  type EvolutionConfig,
} from "../lib/gateway/evolution";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("zapflow_access_token="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function supabase(request: Request) {
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

async function gatewayConfig(request: Request, organizationId: string): Promise<EvolutionConfig> {
  const { url, headers } = supabase(request);
  const response = await fetch(`${url}/rest/v1/rpc/get_evolution_gateway_config`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_organization_id: organizationId }),
  });
  if (!response.ok) throw new Error("Não foi possível carregar a configuração da Evolution");
  const rows = await response.json() as Array<{ base_url?: string | null; api_key?: string | null }>;
  const baseUrl = normalizeEvolutionBaseUrl(rows[0]?.base_url || runtimeEnv("EVOLUTION_API_URL"));
  const apiKey = rows[0]?.api_key || runtimeEnv("EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey) throw new Error("Gateway Evolution ainda não configurado.");
  return { baseUrl, apiKey };
}

async function threadForOrg(request: Request, organizationId: string, threadId: string) {
  const { url, headers } = supabase(request);
  const select = encodeURIComponent(
    "id,organization_id,whatsapp_account_id,session_id,contact_phone,contact_name,remote_jid,last_message_preview,last_message_at,last_direction,unread_count",
  );
  const response = await fetch(
    `${url}/rest/v1/zapflow_chat_threads?id=eq.${encodeURIComponent(threadId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&limit=1`,
    { headers },
  );
  if (!response.ok) throw new Error("Falha ao carregar a conversa");
  const rows = await response.json() as any[];
  if (!rows[0]) throw new Response("Conversa não encontrada", { status: 404 });
  return rows[0];
}

function providerMessageId(result: any) {
  return String(result?.key?.id || result?.messageId || result?.id || `local-${crypto.randomUUID()}`);
}

async function insertOutgoing(
  request: Request,
  organizationId: string,
  thread: any,
  input: {
    providerId: string;
    type: "TEXT" | "AUDIO";
    text?: string | null;
    mimeType?: string | null;
  },
) {
  const { url, headers } = supabase(request);
  const now = new Date().toISOString();
  const body = {
    organization_id: organizationId,
    thread_id: thread.id,
    whatsapp_account_id: thread.whatsapp_account_id,
    session_id: thread.session_id,
    provider_message_id: input.providerId,
    remote_jid: thread.remote_jid || `${thread.contact_phone}@s.whatsapp.net`,
    direction: "OUT",
    message_type: input.type,
    text_content: input.text || null,
    mime_type: input.mimeType || null,
    status: "SENT",
    sent_at: now,
  };
  const response = await fetch(`${url}/rest/v1/zapflow_chat_messages?on_conflict=organization_id,session_id,provider_message_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Mensagem enviada, mas não foi possível salvar no Chat: ${await response.text()}`);
  const rows = await response.json() as any[];

  await fetch(
    `${url}/rest/v1/zapflow_chat_threads?id=eq.${encodeURIComponent(thread.id)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        last_message_preview: input.type === "AUDIO" ? "🎤 Áudio" : input.text,
        last_message_at: now,
        last_direction: "OUT",
        updated_at: now,
      }),
    },
  );

  return rows[0] || { id: crypto.randomUUID(), ...body };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const organizationId = requestUrl.searchParams.get("organizationId");
          const action = requestUrl.searchParams.get("action");
          if (!organizationId || !action) {
            return Response.json({ error: "organizationId e action são obrigatórios" }, { status: 400 });
          }
          await authorizeOrganization(request, organizationId);
          const { url, headers } = supabase(request);

          if (action === "threads") {
            const select = encodeURIComponent(
              "id,organization_id,whatsapp_account_id,session_id,contact_phone,contact_name,remote_jid,last_message_preview,last_message_at,last_direction,unread_count",
            );
            const response = await fetch(
              `${url}/rest/v1/zapflow_chat_threads?organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&order=last_message_at.desc&limit=200`,
              { headers },
            );
            if (!response.ok) throw new Error("Falha ao carregar conversas");
            const threads = await response.json() as any[];

            const accountsResponse = await fetch(
              `${url}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&select=id,internal_name,phone,session_id`,
              { headers },
            );
            const accounts = accountsResponse.ok ? await accountsResponse.json() as any[] : [];
            const accountMap = new Map(accounts.map(item => [item.id, item]));

            return Response.json({
              ok: true,
              threads: threads.map(thread => ({
                ...thread,
                account_name: accountMap.get(thread.whatsapp_account_id)?.internal_name || null,
                account_phone: accountMap.get(thread.whatsapp_account_id)?.phone || null,
              })),
            });
          }

          if (action === "messages") {
            const threadId = requestUrl.searchParams.get("threadId");
            if (!threadId) return Response.json({ error: "threadId é obrigatório" }, { status: 400 });
            await threadForOrg(request, organizationId, threadId);
            const select = encodeURIComponent(
              "id,thread_id,provider_message_id,remote_jid,direction,message_type,text_content,mime_type,media_seconds,status,sent_at",
            );
            const response = await fetch(
              `${url}/rest/v1/zapflow_chat_messages?organization_id=eq.${encodeURIComponent(organizationId)}&thread_id=eq.${encodeURIComponent(threadId)}&select=${select}&order=sent_at.asc&limit=500`,
              { headers },
            );
            if (!response.ok) throw new Error("Falha ao carregar mensagens");
            return Response.json({ ok: true, messages: await response.json() });
          }

          if (action === "media") {
            const messageId = requestUrl.searchParams.get("messageId");
            if (!messageId) return Response.json({ error: "messageId é obrigatório" }, { status: 400 });
            const select = encodeURIComponent("id,session_id,provider_message_id,remote_jid,direction,message_type,mime_type");
            const response = await fetch(
              `${url}/rest/v1/zapflow_chat_messages?id=eq.${encodeURIComponent(messageId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&limit=1`,
              { headers },
            );
            if (!response.ok) throw new Error("Falha ao carregar mídia");
            const rows = await response.json() as any[];
            const message = rows[0];
            if (!message || message.message_type !== "AUDIO") {
              return Response.json({ error: "Áudio não encontrado" }, { status: 404 });
            }
            const config = await gatewayConfig(request, organizationId);
            const media = await getMediaBase64(
              message.session_id,
              {
                key: {
                  id: message.provider_message_id,
                  remoteJid: message.remote_jid,
                  fromMe: message.direction === "OUT",
                },
              },
              config,
            );
            if (!media?.base64) return Response.json({ error: "Mídia indisponível" }, { status: 404 });
            return Response.json({
              ok: true,
              base64: media.base64,
              mimetype: media.mimetype || message.mime_type || "audio/ogg",
            });
          }

          return Response.json({ error: "Ação inválida" }, { status: 400 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Erro no Chat" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > 12_000_000) {
            return Response.json({ error: "Payload muito grande" }, { status: 413 });
          }
          const body = JSON.parse(raw || "{}") as {
            action?: "sendText" | "sendAudio" | "markRead";
            organizationId?: string;
            threadId?: string;
            text?: string;
            audioBase64?: string;
            mimeType?: string;
          };
          if (!body.organizationId || !body.threadId || !body.action) {
            return Response.json({ error: "Dados incompletos" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          const thread = await threadForOrg(request, body.organizationId, body.threadId);
          const { url, headers } = supabase(request);

          if (body.action === "markRead") {
            const response = await fetch(
              `${url}/rest/v1/zapflow_chat_threads?id=eq.${encodeURIComponent(body.threadId)}&organization_id=eq.${encodeURIComponent(body.organizationId)}`,
              {
                method: "PATCH",
                headers,
                body: JSON.stringify({ unread_count: 0, updated_at: new Date().toISOString() }),
              },
            );
            if (!response.ok) throw new Error("Não foi possível marcar a conversa como lida");
            return Response.json({ ok: true });
          }

          const config = await gatewayConfig(request, body.organizationId);

          if (body.action === "sendText") {
            const value = String(body.text || "").trim();
            if (!value || value.length > 4000) {
              return Response.json({ error: "Mensagem inválida" }, { status: 400 });
            }
            const provider = await sendText(thread.session_id, thread.contact_phone, value, config);
            const message = await insertOutgoing(request, body.organizationId, thread, {
              providerId: providerMessageId(provider),
              type: "TEXT",
              text: value,
            });
            return Response.json({ ok: true, message });
          }

          if (body.action === "sendAudio") {
            const base64 = String(body.audioBase64 || "");
            const mimeType = String(body.mimeType || "audio/webm").slice(0, 100);
            if (!base64 || base64.length > 11_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
              return Response.json({ error: "Áudio inválido ou muito grande" }, { status: 400 });
            }
            const provider = await sendWhatsAppAudio(thread.session_id, thread.contact_phone, base64, config);
            const message = await insertOutgoing(request, body.organizationId, thread, {
              providerId: providerMessageId(provider),
              type: "AUDIO",
              mimeType,
            });
            return Response.json({ ok: true, message });
          }

          return Response.json({ error: "Ação inválida" }, { status: 400 });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof SyntaxError) return Response.json({ error: "JSON inválido" }, { status: 400 });
          return Response.json({ error: error instanceof Error ? error.message : "Erro no Chat" }, { status: 500 });
        }
      },
    },
  },
});
