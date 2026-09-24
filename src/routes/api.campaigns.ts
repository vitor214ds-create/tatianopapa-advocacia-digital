import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { createQueuedCampaign, type QueueRecipient } from "../lib/campaign-queue-server";
import { supabasePublicConfig } from "../lib/runtime-env";

function tokenFromRequest(request: Request) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  const raw = (request.headers.get("cookie") || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith("zapflow_access_token="));
  return raw ? decodeURIComponent(raw.split("=").slice(1).join("=")) : null;
}

function config(request: Request) {
  const { url, key } = supabasePublicConfig();
  const token = tokenFromRequest(request);
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

export const Route = createFileRoute("/api/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const organizationId = requestUrl.searchParams.get("organizationId");
          if (!organizationId) {
            return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          }

          await authorizeOrganization(request, organizationId);
          const { url, headers } = config(request);
          const select = encodeURIComponent(
            "id,name,status,total_recipients,eligible_recipients,rejected_recipients,sent_count,failed_count,canceled_count,started_at,completed_at,created_at,updated_at",
          );
          const response = await fetch(
            `${url}/rest/v1/zapflow_campaigns?organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&order=created_at.desc&limit=100`,
            { headers },
          );
          if (!response.ok) throw new Error(`Falha ao carregar campanhas: ${await response.text()}`);
          const campaigns = await response.json() as Array<{
            id: string;
            status: string;
            created_at: string;
            [key: string]: unknown;
          }>;

          const campaignsWithSchedule = await Promise.all(
            campaigns.map(async (campaign, index) => {
              if (index >= 20 || campaign.status !== "QUEUED") return campaign;
              try {
                const jobsResponse = await fetch(
                  `${url}/rest/v1/zapflow_message_jobs?organization_id=eq.${encodeURIComponent(organizationId)}&campaign_id=eq.${encodeURIComponent(campaign.id)}&status=in.(QUEUED,RETRY)&select=next_attempt_at&order=next_attempt_at.asc`,
                  { headers },
                );
                if (!jobsResponse.ok) return campaign;
                const jobs = await jobsResponse.json() as Array<{ next_attempt_at?: string | null }>;
                const times = jobs
                  .map(job => job.next_attempt_at)
                  .filter((value): value is string => Boolean(value))
                  .sort();
                if (!times.length) return campaign;
                return {
                  ...campaign,
                  scheduled_at: times[0],
                  scheduled_end_at: times[times.length - 1],
                };
              } catch {
                return campaign;
              }
            }),
          );

          return Response.json({ ok: true, campaigns: campaignsWithSchedule });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao listar campanhas" },
            { status: 500 },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > 3_000_000) {
            return Response.json({ error: "Payload muito grande" }, { status: 413 });
          }
          let body: {
            organizationId?: string;
            name?: string;
            message?: string;
            recipients?: QueueRecipient[];
            scheduledAt?: string;
            scheduledEndAt?: string;
          };
          try {
            body = JSON.parse(raw);
          } catch {
            return Response.json({ error: "JSON inválido" }, { status: 400 });
          }

          if (
            !body.organizationId ||
            !body.name?.trim() ||
            !body.message?.trim() ||
            !Array.isArray(body.recipients) ||
            !body.recipients.length
          ) {
            return Response.json(
              { error: "organizationId, name, message e recipients são obrigatórios" },
              { status: 400 },
            );
          }

          if (body.name.trim().length > 120) {
            return Response.json({ error: "O nome da campanha deve ter no máximo 120 caracteres" }, { status: 400 });
          }
          if (body.message.trim().length > 4000) {
            return Response.json({ error: "A mensagem deve ter no máximo 4.000 caracteres" }, { status: 400 });
          }
          if (body.recipients.length > 5000) {
            return Response.json(
              { error: "Cada campanha aceita no máximo 5.000 destinatários por criação" },
              { status: 400 },
            );
          }

          if (body.scheduledAt !== undefined) {
            if (typeof body.scheduledAt !== "string" || body.scheduledAt.length > 64) {
              return Response.json({ error: "Data de agendamento inválida" }, { status: 400 });
            }
            const scheduledTimestamp = Date.parse(body.scheduledAt);
            if (!Number.isFinite(scheduledTimestamp)) {
              return Response.json({ error: "Data de agendamento inválida" }, { status: 400 });
            }
            if (scheduledTimestamp < Date.now() - 60_000) {
              return Response.json({ error: "A data de agendamento já passou" }, { status: 400 });
            }
            if (scheduledTimestamp > Date.now() + 366 * 24 * 60 * 60 * 1000) {
              return Response.json({ error: "O agendamento deve estar dentro dos próximos 12 meses" }, { status: 400 });
            }
          }

          if (body.scheduledEndAt !== undefined) {
            if (!body.scheduledAt) {
              return Response.json({ error: "Informe o horário inicial antes do horário final" }, { status: 400 });
            }
            if (typeof body.scheduledEndAt !== "string" || body.scheduledEndAt.length > 64) {
              return Response.json({ error: "Horário final inválido" }, { status: 400 });
            }
            const start = Date.parse(body.scheduledAt);
            const end = Date.parse(body.scheduledEndAt);
            if (!Number.isFinite(end) || end <= start) {
              return Response.json({ error: "O horário final precisa ser posterior ao horário inicial" }, { status: 400 });
            }
            if (end > Date.now() + 366 * 24 * 60 * 60 * 1000) {
              return Response.json({ error: "A janela de envio deve estar dentro dos próximos 12 meses" }, { status: 400 });
            }
          }

          const invalidRecipient = body.recipients.some(recipient =>
            !recipient ||
            typeof recipient !== "object" ||
            typeof recipient.phone !== "string" ||
            recipient.phone.length > 64 ||
            typeof recipient.consent !== "boolean" ||
            (recipient.suppressed !== undefined && typeof recipient.suppressed !== "boolean") ||
            (recipient.name !== undefined && (typeof recipient.name !== "string" || recipient.name.length > 200)) ||
            (recipient.id !== undefined && (typeof recipient.id !== "string" || recipient.id.length > 120))
          );
          if (invalidRecipient) {
            return Response.json({ error: "Lista de destinatários inválida" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);
          const queued = await createQueuedCampaign(request, {
            organizationId: body.organizationId,
            name: body.name.trim(),
            message: body.message.trim(),
            recipients: body.recipients,
            createdBy: user.userId,
            scheduledAt: body.scheduledAt,
            scheduledEndAt: body.scheduledEndAt,
          });

          return Response.json({ ok: true, status: "QUEUED", ...queued }, { status: 201 });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao criar campanha" },
            { status: 500 },
          );
        }
      },
    },
  },
});
