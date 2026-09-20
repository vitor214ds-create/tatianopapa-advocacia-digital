import { createFileRoute } from "@tanstack/react-router";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

export const Route = createFileRoute("/api/gateway-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = new URL(request.url).searchParams.get("secret");
          const expected = runtimeEnv("GATEWAY_WEBHOOK_SECRET");
          if (!expected || secret !== expected) return new Response("Unauthorized", { status: 401 });

          const payload = await request.json() as Record<string, any>;
          const event = String(payload.event || payload.type || "UNKNOWN");
          const instanceName = String(
            payload.instance || payload.instanceName || payload.data?.instance || "",
          );

          const supabaseUrl = supabasePublicConfig().url;
          const serviceKey = runtimeEnv("SUPABASE_SERVICE_ROLE_KEY");
          if (!serviceKey) {
            return Response.json({ ok: true, stored: false, reason: "service-role-not-configured" });
          }

          const headers = {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          };

          const accountResponse = instanceName
            ? await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_accounts?session_id=eq.${encodeURIComponent(instanceName)}&select=id,organization_id&limit=1`,
                { headers },
              )
            : null;
          const accounts = accountResponse?.ok
            ? await accountResponse.json() as { id: string; organization_id: string }[]
            : [];
          const account = accounts[0];

          if (account) {
            const eventWrite = await fetch(`${supabaseUrl}/rest/v1/whatsapp_session_events`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                organization_id: account.organization_id,
                whatsapp_account_id: account.id,
                event_type: event,
                payload,
              }),
            });

            if (!eventWrite.ok) {
              console.error("Falha ao registrar evento Evolution", await eventWrite.text());
            }

            if (event.toUpperCase().includes("CONNECTION")) {
              const state = String(
                payload.data?.state || payload.state || payload.data?.status || "",
              ).toUpperCase();
              const normalized =
                state.includes("OPEN") || state.includes("CONNECTED")
                  ? "CONNECTED"
                  : state.includes("CONNECTING")
                    ? "CONNECTING"
                    : "DISCONNECTED";

              const update = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${account.id}`,
                {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify({
                    session_status: normalized,
                    connection_status: normalized,
                    last_seen_at: new Date().toISOString(),
                    connected_at: normalized === "CONNECTED" ? new Date().toISOString() : null,
                    reconnect_required: normalized === "DISCONNECTED",
                  }),
                },
              );
              if (!update.ok) {
                console.error("Falha ao atualizar sessão Evolution", await update.text());
              }
            }
          }

          return Response.json({ ok: true, stored: Boolean(account) });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Webhook error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
