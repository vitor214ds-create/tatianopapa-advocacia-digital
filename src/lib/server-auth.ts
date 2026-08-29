export type AuthorizedUser = {
  userId: string;
  organizationId: string;
  role: string;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

export async function authorizeOrganization(request: Request, organizationId: string): Promise<AuthorizedUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Response("Não autenticado", { status: 401 });

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const supabaseKey = env("SUPABASE_ANON_KEY");
  const token = authorization.slice(7);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) throw new Response("Sessão inválida", { status: 401 });
  const user = await userResponse.json() as { id?: string };
  if (!user.id) throw new Response("Usuário inválido", { status: 401 });

  const membershipResponse = await fetch(
    `${supabaseUrl}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } },
  );
  if (!membershipResponse.ok) throw new Response("Falha ao validar organização", { status: 403 });
  const memberships = await membershipResponse.json() as { role: string }[];
  if (!memberships[0]) throw new Response("Sem acesso a esta organização", { status: 403 });
  return { userId: user.id, organizationId, role: memberships[0].role };
}

export function requireAdmin(user: AuthorizedUser) {
  if (!["OWNER", "ADMIN"].includes(user.role)) throw new Response("Ação restrita a Owner/Admin", { status: 403 });
}
