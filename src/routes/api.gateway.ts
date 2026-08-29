import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { createInstance, deleteInstance, getConnectionState, getQr, logoutInstance } from "../lib/gateway/evolution";

export const Route = createFileRoute("/api/gateway")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            action?: "create" | "qr" | "status" | "logout" | "delete";
            organizationId?: string;
            instanceName?: string;
          };
          if (!body.organizationId || !body.instanceName || !body.action) {
            return Response.json({ error: "organizationId, instanceName e action são obrigatórios" }, { status: 400 });
          }

          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);

          const safeName = body.instanceName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
          let result;
          switch (body.action) {
            case "create": {
              const origin = new URL(request.url).origin;
              const webhookSecret = process.env.GATEWAY_WEBHOOK_SECRET;
              const webhook = webhookSecret ? `${origin}/api/gateway-webhook?secret=${encodeURIComponent(webhookSecret)}` : undefined;
              result = await createInstance(safeName, webhook);
              break;
            }
            case "qr": result = await getQr(safeName); break;
            case "status": result = await getConnectionState(safeName); break;
            case "logout": result = await logoutInstance(safeName); break;
            case "delete": result = await deleteInstance(safeName); break;
          }

          return Response.json({ ok: true, result });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no gateway" }, { status: 500 });
        }
      },
    },
  },
});
