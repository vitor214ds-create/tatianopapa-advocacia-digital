import { createFileRoute } from "@tanstack/react-router";

const ACCESS_COOKIE = "zapflow_access_token";
const REFRESH_COOKIE = "zapflow_refresh_token";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase server config ausente");
  return { url, anonKey };
}

function parseCookies(request: Request) {
  const header = request.headers.get("cookie") || "";
  return Object.fromEntries(
    header.split(";").map(part => part.trim()).filter(Boolean).map(part => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

function cookie(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(name: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function getProfile(accessToken: string) {
  const { url, anonKey } = supabaseConfig();
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id: string; email?: string };

  const membershipResponse = await fetch(
    `${url}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(user.id)}&select=organization_id,role&order=created_at.asc`,
    { headers },
  );
  if (!membershipResponse.ok) throw new Error(`Falha ao carregar organizações: ${await membershipResponse.text()}`);
  const memberships = await membershipResponse.json() as { organization_id: string; role: string }[];
  return { user: { id: user.id, email: user.email || null }, memberships };
}

async function refreshSession(refreshToken: string) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  return await response.json() as { access_token: string; refresh_token: string; expires_in?: number };
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const cookies = parseCookies(request);
          let accessToken = cookies[ACCESS_COOKIE];
          let refreshed: { access_token: string; refresh_token: string; expires_in?: number } | null = null;

          let profile = accessToken ? await getProfile(accessToken) : null;
          if (!profile && cookies[REFRESH_COOKIE]) {
            refreshed = await refreshSession(cookies[REFRESH_COOKIE]);
            if (refreshed) {
              accessToken = refreshed.access_token;
              profile = await getProfile(accessToken);
            }
          }

          if (!profile) return Response.json({ authenticated: false }, { status: 401 });
          const response = Response.json({ authenticated: true, ...profile, activeOrganizationId: profile.memberships[0]?.organization_id || null });
          if (refreshed) {
            response.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, refreshed.access_token, refreshed.expires_in || 3600));
            response.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, refreshed.refresh_token, 60 * 60 * 24 * 30));
          }
          return response;
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Erro ao validar sessão" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { action?: "login" | "logout"; email?: string; password?: string };
          if (body.action === "logout") {
            const response = Response.json({ ok: true });
            response.headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
            response.headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
            return response;
          }

          if (body.action !== "login" || !body.email || !body.password) {
            return Response.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
          }

          const { url, anonKey } = supabaseConfig();
          const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { apikey: anonKey, "Content-Type": "application/json" },
            body: JSON.stringify({ email: body.email.trim(), password: body.password }),
          });
          if (!loginResponse.ok) {
            return Response.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
          }

          const session = await loginResponse.json() as { access_token: string; refresh_token: string; expires_in?: number };
          const profile = await getProfile(session.access_token);
          if (!profile) return Response.json({ error: "Não foi possível carregar o usuário" }, { status: 401 });
          if (!profile.memberships.length) return Response.json({ error: "Usuário sem organização vinculada" }, { status: 403 });

          const response = Response.json({ ok: true, ...profile, activeOrganizationId: profile.memberships[0].organization_id });
          response.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, session.access_token, session.expires_in || 3600));
          response.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
          return response;
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no login" }, { status: 500 });
        }
      },
    },
  },
});
