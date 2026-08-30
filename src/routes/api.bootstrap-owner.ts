import { createFileRoute } from "@tanstack/react-router";

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bootstrapSecret = process.env.ZAPFLOW_BOOTSTRAP_SECRET;
  if (!url || !serviceKey || !bootstrapSecret) throw new Error("Bootstrap não configurado no servidor");
  return { url, serviceKey, bootstrapSecret };
}
function bearer(request: Request) { const value=request.headers.get("authorization"); return value?.startsWith("Bearer ") ? value.slice(7) : null; }

export const Route = createFileRoute("/api/bootstrap-owner")({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      const { url, serviceKey, bootstrapSecret } = config();
      if (bearer(request) !== bootstrapSecret) return Response.json({ error: "Bootstrap não autorizado" }, { status: 401 });
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
      const membersCheck = await fetch(`${url}/rest/v1/organization_members?select=user_id,organization_id,role&limit=1`, { headers });
      if (!membersCheck.ok) throw new Error(`Não foi possível verificar membros: ${await membersCheck.text()}`);
      const existingMembers = await membersCheck.json() as unknown[];
      if (existingMembers.length) return Response.json({ error: "Bootstrap encerrado: já existe membro na plataforma" }, { status: 409 });
      const body = await request.json() as { email?: string; password?: string; organizationName?: string };
      if (!body.email?.trim() || !body.password || body.password.length < 8) return Response.json({ error: "E-mail e senha com pelo menos 8 caracteres são obrigatórios" }, { status: 400 });
      const createUser = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers, body: JSON.stringify({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true }) });
      if (!createUser.ok) throw new Error(`Falha ao criar Owner no Auth: ${await createUser.text()}`);
      const user = await createUser.json() as { id: string; email?: string };
      let organizationId: string | null = null;
      const orgResponse = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, { headers });
      if (orgResponse.ok) organizationId = ((await orgResponse.json() as { id:string }[])[0]?.id || null);
      if (!organizationId) {
        const createOrg = await fetch(`${url}/rest/v1/organizations`, { method: "POST", headers, body: JSON.stringify({ name: body.organizationName?.trim() || "ZapFlow" }) });
        if (!createOrg.ok) { await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers }); throw new Error(`Falha ao criar organização: ${await createOrg.text()}`); }
        organizationId = ((await createOrg.json() as { id:string }[])[0]?.id || null);
      }
      if (!organizationId) throw new Error("Organização não retornou ID");
      const membership = await fetch(`${url}/rest/v1/organization_members`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, user_id: user.id, role: "OWNER" }) });
      if (!membership.ok) { await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers }); throw new Error(`Falha ao vincular Owner: ${await membership.text()}`); }
      return Response.json({ ok: true, user: { id: user.id, email: user.email || body.email.trim().toLowerCase() }, organizationId, role: "OWNER", message: "Owner criado. Remova ZAPFLOW_BOOTSTRAP_SECRET do ambiente após o primeiro uso." }, { status: 201 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no bootstrap" }, { status: 500 }); }
  },
} } });
