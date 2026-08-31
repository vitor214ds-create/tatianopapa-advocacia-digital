import { createFileRoute } from "@tanstack/react-router";
import { authorizeOrganization, requireAdmin } from "../lib/server-auth";
import { supabasePublicConfig } from "../lib/runtime-env";

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = (request.headers.get("cookie") || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith("zapflow_access_token="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function headers(request: Request) {
  const token = accessToken(request);
  if (!token) throw new Response("Não autenticado", { status: 401 });
  const { key } = supabasePublicConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function cleanVariables(content: string) {
  const found = [...content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map(match => match[1]);
  return [...new Set(found)];
}

export const Route = createFileRoute("/api/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const organizationId = new URL(request.url).searchParams.get("organizationId");
          if (!organizationId) return Response.json({ error: "organizationId é obrigatório" }, { status: 400 });
          await authorizeOrganization(request, organizationId);
          const { url } = supabasePublicConfig();
          const select = encodeURIComponent("id,name,content,variables,category,is_active,created_at,updated_at");
          const response = await fetch(
            `${url}/rest/v1/zapflow_message_templates?organization_id=eq.${encodeURIComponent(organizationId)}&select=${select}&order=created_at.desc`,
            { headers: headers(request) },
          );
          if (!response.ok) return Response.json({ error: await response.text() }, { status: response.status });
          return Response.json({ templates: await response.json() });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar templates" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            action?: "create" | "update" | "delete";
            organizationId?: string;
            id?: string;
            name?: string;
            content?: string;
            category?: string;
          };
          if (!body.organizationId || !body.action) {
            return Response.json({ error: "organizationId e action são obrigatórios" }, { status: 400 });
          }
          const user = await authorizeOrganization(request, body.organizationId);
          requireAdmin(user);
          const { url } = supabasePublicConfig();
          const authHeaders = headers(request);

          if (body.action === "delete") {
            if (!body.id) return Response.json({ error: "id é obrigatório" }, { status: 400 });
            const response = await fetch(
              `${url}/rest/v1/zapflow_message_templates?id=eq.${encodeURIComponent(body.id)}&organization_id=eq.${encodeURIComponent(body.organizationId)}`,
              { method: "DELETE", headers: authHeaders },
            );
            if (!response.ok) return Response.json({ error: await response.text() }, { status: response.status });
            return Response.json({ ok: true });
          }

          const name = body.name?.trim() || "";
          const content = body.content?.trim() || "";
          if (name.length < 2 || name.length > 80) {
            return Response.json({ error: "O nome deve ter entre 2 e 80 caracteres" }, { status: 400 });
          }
          if (content.length < 1 || content.length > 4000) {
            return Response.json({ error: "A mensagem deve ter entre 1 e 4.000 caracteres" }, { status: 400 });
          }
          const payload = {
            organization_id: body.organizationId,
            name,
            content,
            variables: cleanVariables(content),
            category: body.category?.trim() || "general",
            created_by: user.userId,
            updated_at: new Date().toISOString(),
          };

          if (body.action === "update") {
            if (!body.id) return Response.json({ error: "id é obrigatório" }, { status: 400 });
            const response = await fetch(
              `${url}/rest/v1/zapflow_message_templates?id=eq.${encodeURIComponent(body.id)}&organization_id=eq.${encodeURIComponent(body.organizationId)}`,
              { method: "PATCH", headers: authHeaders, body: JSON.stringify(payload) },
            );
            if (!response.ok) return Response.json({ error: await response.text() }, { status: response.status });
            return Response.json({ ok: true, template: (await response.json())[0] });
          }

          const response = await fetch(`${url}/rest/v1/zapflow_message_templates`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const detail = await response.text();
            if (response.status === 409 || detail.includes("duplicate")) {
              return Response.json({ error: "Já existe um template com esse nome" }, { status: 409 });
            }
            return Response.json({ error: detail }, { status: response.status });
          }
          return Response.json({ ok: true, template: (await response.json())[0] });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar template" }, { status: 500 });
        }
      },
    },
  },
});
