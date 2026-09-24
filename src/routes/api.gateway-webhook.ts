import { createFileRoute } from "@tanstack/react-router";
import { supabasePublicConfig } from "../lib/runtime-env";

function normalizedEvent(event: string) {
  return event.toUpperCase().replace(/[.-]/g, "_");
}

function upperEventIncludesMessages(event: string) {
  return normalizedEvent(event) === "MESSAGES_UPSERT";
}

export const Route = createFileRoute("/api/gateway-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const requestUrl = new URL(request.url);
          const organizationId =
            request.headers.get("x-zapflow-organization-id") ||
            requestUrl.searchParams.get("organizationId");
          const secret =
            request.headers.get("x-zapflow-webhook-secret") ||
            requestUrl.searchParams.get("secret");
          if (!organizationId || !secret || secret.length < 32) {
            return new Response("Unauthorized", { status: 401 });
          }

          const contentLength = Number(request.headers.get("content-length") || "0");
          if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
            return Response.json({ error: "Payload muito grande" }, { status: 413 });
          }

          const raw = await request.text();
          if (raw.length > 1_000_000) {
            return Response.json({ error: "Payload muito grande" }, { status: 413 });
          }

          let payload: Record<string, any> | null = null;
          try {
            payload = JSON.parse(raw);
          } catch {
            return Response.json({ error: "JSON inválido" }, { status: 400 });
          }

          if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return Response.json({ error: "Payload inválido" }, { status: 400 });
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

          let chatStored = false;
          if (upperEventIncludesMessages(event)) {
            const chatResponse = await fetch(`${url}/rest/v1/rpc/zapflow_ingest_chat_message`, {
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
            if (chatResponse.ok) {
              chatStored = Boolean(await chatResponse.json());
            } else {
              console.error("Falha ao persistir mensagem no Chat", chatResponse.status, await chatResponse.text());
            }
          }

          return Response.json({ ok: true, stored, chatStored });
        } catch (error) {
          console.error("Gateway webhook failed", error);
          return Response.json({ error: "Webhook error" }, { status: 500 });
        }
      },
    },
  },
});
