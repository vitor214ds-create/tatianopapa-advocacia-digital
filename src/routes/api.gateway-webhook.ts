import { createFileRoute } from "@tanstack/react-router";
import { supabasePublicConfig } from "../lib/runtime-env";

export const Route = createFileRoute("/api/gateway-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const organizationId = requestUrl.searchParams.get("organizationId");
          const secret = requestUrl.searchParams.get("secret");
          if (!organizationId || !secret || secret.length < 32) {
            return new Response("Unauthorized", { status: 401 });
          }

          const payload = await request.json().catch(() => null) as Record<string, any> | null;
          if (!payload) {
            return Response.json({ error: "JSON inválido" }, { status: 400 });
          }

          const event = String(payload.event || payload.type || "UNKNOWN").slice(0, 120);
          const instanceName = String(
            payload.instance || payload.instanceName || payload.data?.instance || "",
          ).slice(0, 120);

          if (!instanceName) {
            return Response.json({ error: "Instância ausente" }, { status: 400 });
          }

          const { url, key } = supabasePublicConfig();
          const response = await fetch(`${url}/rest/v1/rpc/ingest_evolution_webhook`, {
            method: "POST",
            headers: {
              apikey: key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_organization_id: organizationId,
              p_secret: secret,
              p_instance_name: instanceName,
              p_event: event,
              p_payload: payload,
            }),
          });

          if (!response.ok) {
            console.error("Falha ao processar webhook Evolution", response.status, await response.text());
            return Response.json({ error: "Falha ao processar webhook" }, { status: 500 });
          }

          const stored = Boolean(await response.json());
          return Response.json({ ok: true, stored });
        } catch (error) {
          console.error("Gateway webhook failed", error);
          return Response.json({ error: "Webhook error" }, { status: 500 });
        }
      },
    },
  },
});
