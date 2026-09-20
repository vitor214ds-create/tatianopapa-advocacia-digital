import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization } from "../lib/server-auth";
import { supabasePublicConfig } from "../lib/runtime-env";

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith("zapflow_access_token="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const organizationId = new URL(request.url).searchParams.get("organizationId");
          if (!organizationId) {
            return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          }

          await authorizeOrganization(request, organizationId);

          const token = accessToken(request);
          if (!token) return Response.json({ error: "Não autenticado" }, { status: 401 });

          const { url, key } = supabasePublicConfig();
          const response = await fetch(
            `${url}/rest/v1/rpc/zapflow_dashboard_metrics`,
            {
              method: "POST",
              headers: {
                apikey: key,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ p_organization_id: organizationId }),
              signal: AbortSignal.timeout(10_000),
            },
          );

          if (!response.ok) {
            console.error("Falha ao carregar métricas do dashboard", response.status, await response.text());
            return Response.json({ error: "Não foi possível carregar as métricas" }, { status: 500 });
          }

          const metrics = await response.json() as {
            sent24h?: number;
            failed24h?: number;
            pending?: number;
            replies24h?: number;
          };

          return Response.json({
            ok: true,
            metrics: {
              sent24h: Number(metrics.sent24h || 0),
              failed24h: Number(metrics.failed24h || 0),
              pending: Number(metrics.pending || 0),
              replies24h: Number(metrics.replies24h || 0),
            },
          });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("Dashboard metrics failed", error);
          return Response.json({ error: "Falha ao carregar dashboard" }, { status: 500 });
        }
      },
    },
  },
});
