import { cookieValue, serverFetch } from "./request-utils";
import { supabasePublicConfig } from "./runtime-env";

export type AuthorizedUser = { userId: string; organizationId: string; role: string };

export async function authorizeOrganization(request: Request, organizationId: string): Promise<AuthorizedUser> {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const token = bearerToken || cookieValue(request, "zapflow_access_token");
  if (!token) throw new Response("Não autenticado", { status: 401 });

  const { url, key } = supabasePublicConfig();
  const userResponse = await serverFetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (userResponse.status === 401 || userResponse.status === 403) throw new Response("Sessão inválida", { status: 401 });
  if (!userResponse.ok) throw new Response("Serviço de autenticação indisponível. Tente novamente.", { status: 503 });

  const user = await userResponse.json() as { id?: string };
  if (!user.id) throw new Response("Usuário inválido", { status: 401 });

  const membershipResponse = await serverFetch(
    `${url}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
  if (!membershipResponse.ok) throw new Response("Falha ao validar organização. Tente novamente.", { status: 503 });

  const memberships = await membershipResponse.json() as { role: string }[];
  if (!memberships[0]) throw new Response("Sem acesso a esta organização", { status: 403 });

  return { userId: user.id, organizationId, role: memberships[0].role };
}

export function requireAdmin(user: AuthorizedUser) {
  const normalizedRole = String(user.role || "").toLowerCase();
  if (!["owner", "admin"].includes(normalizedRole)) {
    throw new Response("Ação restrita a Owner/Admin", { status: 403 });
  }
}
