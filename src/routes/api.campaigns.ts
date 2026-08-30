import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { createQueuedCampaign, type QueueRecipient } from "../lib/campaign-queue-server";

function tokenFromRequest(request: Request) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  const raw = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith("zapflow_access_token="));
  return raw ? decodeURIComponent(raw.split("=").slice(1).join("=")) : null;
}

function config(request: Request) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  const token = tokenFromRequest(request);
  if (!url || !key || !token) throw new Error("Configuração/autenticação Supabase ausente");
  return { url, headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

export const Route = createFileRoute("/api/campaigns")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const requestUrl = new URL(request.url);
        const organizationId = requestUrl.searchParams.get("organizationId");
        if (!organizationId) return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
        await authorizeOrganization(request, organizationId);
        const { url, headers } = config(request);
        const select = encodeURIComponent("id,name,status,total_recipients,eligible_recipients,rejected_recipients,sent_count,failed_count,started_at,completed_at,created_at,updated_at");
        const response = await fetch(`${url}/rest/v1/zapflow_campaigns?organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&order=created_at.desc&limit=100`, { headers });
        if (!response.ok) throw new Error(`Fila ainda não disponível no banco: ${await response.text()}`);
        return Response.json({ ok: true, campaigns: await response.json() });
      } catch (error) {
        if (error instanceof Response) return error;
        return Response.json({ error: error instanceof Error ? error.message : "Erro ao listar campanhas" }, { status: 500 });
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.json() as { organizationId?: string; name?: string; message?: string; recipients?: QueueRecipient[] };
        if (!body.organizationId || !body.name?.trim() || !body.message?.trim() || !Array.isArray(body.recipients) || !body.recipients.length) return Response.json({ error: "organizationId, name, message e recipients são obrigatórios" }, { status: 400 });
        if (body.recipients.length > 5000) return Response.json({ error: "Cada campanha aceita no máximo 5.000 destinatários por criação" }, { status: 400 });
        const user = await authorizeOrganization(request, body.organizationId); requireAdmin(user);
        const queued = await createQueuedCampaign(request, { organizationId: body.organizationId, name: body.name.trim(), message: body.message.trim(), recipients: body.recipients, createdBy: user.userId });
        return Response.json({ ok: true, status: "QUEUED", ...queued }, { status: 201 });
      } catch (error) {
        if (error instanceof Response) return error;
        return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar campanha" }, { status: 500 });
      }
    },
  } },
});
