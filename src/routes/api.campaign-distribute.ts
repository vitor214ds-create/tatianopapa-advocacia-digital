import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { loadActiveSessions, normalizePhone } from "../lib/campaign-queue-server";

type RecipientInput = {
  id?: string;
  phone: string;
  consent: boolean;
  suppressed?: boolean;
  name?: string;
};

export const Route = createFileRoute("/api/campaign-distribute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            organizationId?: string;
            recipients?: RecipientInput[];
            dryRun?: boolean;
          };

          if (!body.organizationId) {
            return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          }
          if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
            return Response.json({ error: "Informe ao menos um destinatário" }, { status: 400 });
          }
          if (body.recipients.length > 5000) {
            return Response.json({ error: "A prévia aceita no máximo 5.000 destinatários" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);

          // This legacy route is intentionally preview-only. Real sending must use
          // /api/campaigns so every message is persisted, paced and retried safely.
          if (body.dryRun === false) {
            return Response.json({
              error: "Envio direto desativado. Crie a campanha pela fila persistente para usar divisão equilibrada e pacing por sessão.",
              code: "QUEUE_REQUIRED",
            }, { status: 409 });
          }

          const unique = new Map<string, RecipientInput & { normalizedPhone: string }>();
          let rejected = 0;
          for (const recipient of body.recipients) {
            if (recipient.consent !== true || recipient.suppressed === true) { rejected++; continue; }
            const normalizedPhone = normalizePhone(recipient.phone);
            if (normalizedPhone.length < 12 || normalizedPhone.length > 15 || unique.has(normalizedPhone)) { rejected++; continue; }
            unique.set(normalizedPhone, { ...recipient, normalizedPhone });
          }
          const eligible = [...unique.values()];
          const sessions = await loadActiveSessions(request, body.organizationId);
          if (!sessions.length) {
            return Response.json({ error: "Nenhuma sessão WhatsApp conectada e habilitada" }, { status: 409 });
          }

          const base = Math.floor(eligible.length / sessions.length);
          const remainder = eligible.length % sessions.length;
          const allocation = sessions.map((session, index) => ({
            sessionId: session.session_id,
            name: session.internal_name || session.session_id,
            jobs: base + (index < remainder ? 1 : 0),
          }));

          return Response.json({
            ok: true,
            dryRun: true,
            eligible: eligible.length,
            rejected,
            sessions: sessions.length,
            allocation,
            balanced: true,
            maxDifferenceBetweenSessions: eligible.length ? 1 : 0,
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no distribuidor" }, { status: 500 });
        }
      },
    },
  },
});
