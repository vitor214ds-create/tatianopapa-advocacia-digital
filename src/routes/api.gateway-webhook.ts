import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gateway-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = new URL(request.url).searchParams.get("secret");
          const expected = process.env.GATEWAY_WEBHOOK_SECRET;
          if (!expected || secret !== expected) return new Response("Unauthorized", { status: 401 });

          const payload = await request.json() as Record<string, any>;
          const event = String(payload.event || payload.type || "UNKNOWN");
          const instanceName = String(payload.instance || payload.instanceName || payload.data?.instance || "");

          const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !serviceKey) return Response.json({ ok: true, stored: false });

          const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
          const accountResponse = instanceName ? await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?session_id=eq.${encodeURIComponent(instanceName)}&select=id,organization_id&limit=1`, { headers }) : null;
          const accounts = accountResponse?.ok ? await accountResponse.json() as { id: string; organization_id: string }[] : [];
          const account = accounts[0];

          if (account) {
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_session_events`, {
              method: "POST",
              headers,
              body: JSON.stringify({ organization_id: account.organization_id, whatsapp_account_id: account.id, event_type: event, payload }),
            });

            if (event.toUpperCase().includes("CONNECTION")) {
              const state = String(payload.data?.state || payload.state || payload.data?.status || "").toUpperCase();
              const normalized = state.includes("OPEN") || state.includes("CONNECTED") ? "CONNECTED" : state.includes("CONNECTING") ? "CONNECTING" : "DISCONNECTED";
              await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${account.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ session_status: normalized, connection_status: normalized, last_seen_at: new Date().toISOString(), reconnect_required: normalized === "DISCONNECTED" }),
              });
            }
          }

          return Response.json({ ok: true });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Webhook error" }, { status: 500 });
        }
      },
    },
  },
});
