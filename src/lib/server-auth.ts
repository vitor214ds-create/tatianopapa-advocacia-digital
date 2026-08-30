import { supabasePublicConfig } from "./runtime-env";
import { readEmergencySession } from "./emergency-auth";

export type AuthorizedUser = { userId: string; organizationId: string; role: string };

function getCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    if (trimmed.slice(0, index) === name) return decodeURIComponent(trimmed.slice(index + 1));
  }
  return null;
}

export async function authorizeOrganization(request: Request, organizationId: string): Promise<AuthorizedUser> {
  const emergency = await readEmergencySession(request);
  if (emergency) {
    if (emergency.organizationId !== organizationId) throw new Response("Sem acesso a esta organização", { status: 403 });
    return { userId: emergency.userId, organizationId: emergency.organizationId, role: emergency.role };
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const token = bearerToken || getCookie(request, "zapflow_access_token");
  if (!token) throw new Response("Não autenticado", { status: 401 });

  const { url, key } = supabasePublicConfig();
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) throw new Response("Sessão inválida", { status: 401 });
  const user = await userResponse.json() as { id?: string };
  if (!user.id) throw new Response("Usuário inválido", { status: 401 });

  const membershipResponse = await fetch(`${url}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!membershipResponse.ok) throw new Response("Falha ao validar organização", { status: 403 });
  const memberships = await membershipResponse.json() as { role: string }[];
  if (!memberships[0]) throw new Response("Sem acesso a esta organização", { status: 403 });
  return { userId: user.id, organizationId, role: memberships[0].role };
}

export function requireAdmin(user: AuthorizedUser) {
  if (!["OWNER", "ADMIN"].includes(user.role)) throw new Response("Ação restrita a Owner/Admin", { status: 403 });
}
