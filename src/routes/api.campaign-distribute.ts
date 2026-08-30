import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { sendText } from "../lib/gateway/evolution";

type RecipientInput = {
  id?: string;
  phone: string;
  consent: boolean;
  suppressed?: boolean;
  name?: string;
};

type ActiveSession = {
  id: string;
  session_id: string;
  internal_name?: string | null;
  distribution_weight?: number | null;
  weight?: number | null;
};

type Allocation = {
  recipient: RecipientInput & { normalizedPhone: string };
  session: ActiveSession;
};

function getSupabaseConfig(request: Request) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!url || !key || !authorization) throw new Error("Supabase server config ausente");
  return {
    url,
    headers: {
      apikey: key,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
  };
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function positiveWeight(session: ActiveSession) {
  const raw = session.distribution_weight ?? session.weight ?? 100;
  const weight = Number(raw);
  return Number.isFinite(weight) && weight > 0 ? weight : 100;
}

function buildWeightedAllocations(
  recipients: Array<RecipientInput & { normalizedPhone: string }>,
  sessions: ActiveSession[],
): Allocation[] {
  if (!sessions.length) return [];

  const current = new Map<string, number>();
  const totalWeight = sessions.reduce((sum, session) => sum + positiveWeight(session), 0);
  const allocations: Allocation[] = [];

  for (const recipient of recipients) {
    let selected = sessions[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const session of sessions) {
      const weight = positiveWeight(session);
      const nextScore = (current.get(session.id) ?? 0) + weight;
      current.set(session.id, nextScore);
      if (nextScore > bestScore) {
        bestScore = nextScore;
        selected = session;
      }
    }

    current.set(selected.id, (current.get(selected.id) ?? 0) - totalWeight);
    allocations.push({ recipient, session: selected });
  }

  return allocations;
}

async function loadActiveSessions(request: Request, organizationId: string) {
  const { url, headers } = getSupabaseConfig(request);
  const select = encodeURIComponent("id,session_id,internal_name,distribution_weight,weight");
  const query = [
    `organization_id=eq.${encodeURIComponent(organizationId)}`,
    "is_enabled=eq.true",
    "connection_status=eq.CONNECTED",
    `select=${select}`,
    "order=created_at.asc",
  ].join("&");

  const response = await fetch(`${url}/rest/v1/whatsapp_accounts?${query}`, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao carregar sessões conectadas: ${detail}`);
  }

  const sessions = (await response.json()) as ActiveSession[];
  return sessions.filter((session) => Boolean(session.session_id));
}

function summarize(allocations: Allocation[]) {
  const bySession = new Map<string, { sessionId: string; name: string; jobs: number }>();
  for (const allocation of allocations) {
    const key = allocation.session.id;
    const current = bySession.get(key) ?? {
      sessionId: allocation.session.session_id,
      name: allocation.session.internal_name || allocation.session.session_id,
      jobs: 0,
    };
    current.jobs += 1;
    bySession.set(key, current);
  }
  return [...bySession.values()];
}

export const Route = createFileRoute("/api/campaign-distribute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            organizationId?: string;
            message?: string;
            recipients?: RecipientInput[];
            dryRun?: boolean;
          };

          if (!body.organizationId) {
            return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          }
          if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
            return Response.json({ error: "Informe ao menos um destinatário" }, { status: 400 });
          }
          if (!body.dryRun && !body.message?.trim()) {
            return Response.json({ error: "message é obrigatória para executar o envio" }, { status: 400 });
          }
          if (body.recipients.length > 5000) {
            return Response.json({ error: "Uma execução aceita no máximo 5.000 destinatários" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);

          const eligible = body.recipients
            .filter((recipient) => recipient.consent === true && recipient.suppressed !== true)
            .map((recipient) => ({ ...recipient, normalizedPhone: normalizePhone(recipient.phone) }))
            .filter((recipient) => recipient.normalizedPhone.length >= 12 && recipient.normalizedPhone.length <= 15);

          const rejected = body.recipients.length - eligible.length;
          if (!eligible.length) {
            return Response.json({
              ok: true,
              dryRun: body.dryRun !== false,
              eligible: 0,
              rejected,
              sessions: 0,
              allocation: [],
              results: [],
              warning: "Nenhum destinatário elegível. É necessário consentimento explícito, telefone válido e ausência de supressão.",
            });
          }

          const sessions = await loadActiveSessions(request, body.organizationId);
          if (!sessions.length) {
            return Response.json({ error: "Nenhuma sessão WhatsApp conectada e habilitada" }, { status: 409 });
          }

          const allocations = buildWeightedAllocations(eligible, sessions);
          const allocation = summarize(allocations);

          if (body.dryRun !== false) {
            return Response.json({
              ok: true,
              dryRun: true,
              eligible: eligible.length,
              rejected,
              sessions: sessions.length,
              allocation,
            });
          }

          const message = body.message!.trim();
          const results: Array<{
            recipientId?: string;
            phone: string;
            sessionId: string;
            ok: boolean;
            error?: string;
          }> = [];

          for (const job of allocations) {
            try {
              await sendText(job.session.session_id, job.recipient.normalizedPhone, message);
              results.push({
                recipientId: job.recipient.id,
                phone: job.recipient.normalizedPhone,
                sessionId: job.session.session_id,
                ok: true,
              });
            } catch (error) {
              results.push({
                recipientId: job.recipient.id,
                phone: job.recipient.normalizedPhone,
                sessionId: job.session.session_id,
                ok: false,
                error: error instanceof Error ? error.message : "Falha inesperada no envio",
              });
            }
          }

          const sent = results.filter((result) => result.ok).length;
          const failed = results.length - sent;

          return Response.json({
            ok: failed === 0,
            dryRun: false,
            eligible: eligible.length,
            rejected,
            sessions: sessions.length,
            allocation,
            sent,
            failed,
            results,
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro inesperado no distribuidor" },
            { status: 500 },
          );
        }
      },
    },
  },
});
