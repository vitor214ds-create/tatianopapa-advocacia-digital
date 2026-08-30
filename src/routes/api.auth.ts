import { createFileRoute } from "@tanstack/react-router";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

const ACCESS_COOKIE = "zapflow_access_token";
const REFRESH_COOKIE = "zapflow_refresh_token";
const PRIMARY_ORGANIZATION_ID = "c3b3518d-4565-415f-99f1-a1f3c8f0487a";

type Membership = { organization_id: string; role: string };
type SessionPayload = { access_token: string; refresh_token: string; expires_in?: number };

function parseCookies(request: Request) {
  const header = request.headers.get("cookie") || "";
  const entries = header
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      return index === -1
        ? [part, ""]
        : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    });
  return Object.fromEntries(entries) as Record<string, string>;
}

function isProduction() {
  return runtimeEnv("NODE_ENV") === "production" || runtimeEnv("MODE") === "production";
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProduction() ? "; Secure" : ""}`;
}

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction() ? "; Secure" : ""}`;
}

function activeOrganizationId(memberships: Membership[]) {
  return memberships.find(item => item.organization_id === PRIMARY_ORGANIZATION_ID)?.organization_id
    ?? memberships[0]?.organization_id
    ?? null;
}

async function getProfile(accessToken: string) {
  const { url, key } = supabasePublicConfig();
  const headers = { apikey: key, Authorization: `Bearer ${accessToken}` };

  const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
  if (!userResponse.ok) return null;

  const user = await userResponse.json() as { id: string; email?: string };
  const membershipResponse = await fetch(
    `${url}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(user.id)}&select=organization_id,role`,
    { headers },
  );

  if (!membershipResponse.ok) {
    throw new Error(`Falha ao carregar organizações: ${await membershipResponse.text()}`);
  }

  const memberships = await membershipResponse.json() as Membership[];
  return {
    user: { id: user.id, email: user.email || null },
    memberships,
  };
}

async function refreshSession(refreshToken: string): Promise<SessionPayload | null> {
  const { url, key } = supabasePublicConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return null;
  return await response.json() as SessionPayload;
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const cookies = parseCookies(request);
          let accessToken = cookies[ACCESS_COOKIE];
          let refreshed: SessionPayload | null = null;
          let profile = accessToken ? await getProfile(accessToken) : null;

          if (!profile && cookies[REFRESH_COOKIE]) {
            refreshed = await refreshSession(cookies[REFRESH_COOKIE]);
            if (refreshed) {
              accessToken = refreshed.access_token;
              profile = await getProfile(accessToken);
            }
          }

          if (!profile) {
            return Response.json({ authenticated: false }, { status: 401 });
          }

          const organizationId = activeOrganizationId(profile.memberships);
          if (!organizationId) {
            return Response.json({ error: "Usuário sem organização vinculada" }, { status: 403 });
          }

          const response = Response.json({
            authenticated: true,
            ...profile,
            activeOrganizationId: organizationId,
            authMode: "supabase",
          });

          if (refreshed) {
            response.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, refreshed.access_token, refreshed.expires_in || 3600));
            response.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, refreshed.refresh_token, 60 * 60 * 24 * 30));
          }

          return response;
        } catch (error) {
          console.error("Auth GET failed", error);
          return Response.json({ authenticated: false }, { status: 401 });
        }
      },

      POST: async ({ request }) => {
        const body = await request.json() as {
          action?: "login" | "logout";
          email?: string;
          password?: string;
        };

        if (body.action === "logout") {
          const response = Response.json({ ok: true });
          response.headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
          response.headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
          return response;
        }

        if (body.action !== "login" || !body.email || !body.password) {
          return Response.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
        }

        try {
          const { url, key } = supabasePublicConfig();
          const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { apikey: key, "Content-Type": "application/json" },
            body: JSON.stringify({
              email: body.email.trim().toLowerCase(),
              password: body.password,
            }),
          });

          if (!loginResponse.ok) {
            console.error("Supabase password login failed", loginResponse.status, await loginResponse.text());
            return Response.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
          }

          const session = await loginResponse.json() as SessionPayload;
          const profile = await getProfile(session.access_token);

          if (!profile) {
            return Response.json({ error: "Não foi possível carregar o usuário" }, { status: 401 });
          }

          const organizationId = activeOrganizationId(profile.memberships);
          if (!organizationId) {
            return Response.json({ error: "Usuário sem organização vinculada" }, { status: 403 });
          }

          const response = Response.json({
            authenticated: true,
            ...profile,
            activeOrganizationId: organizationId,
            authMode: "supabase",
          });
          response.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, session.access_token, session.expires_in || 3600));
          response.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
          return response;
        } catch (error) {
          console.error("Auth POST failed", error);
          return Response.json({ error: "Falha na configuração de autenticação" }, { status: 500 });
        }
      },
    },
  },
});
