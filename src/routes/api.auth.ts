import { createFileRoute } from "@tanstack/react-router";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

const ACCESS_COOKIE = "zapflow_access_token";
const REFRESH_COOKIE = "zapflow_refresh_token";

type Membership = { organization_id: string; role: string };
type SessionPayload = { access_token: string; refresh_token: string; expires_in?: number };
type LoginBucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __zapflowLoginBuckets: Map<string, LoginBucket> | undefined;
}

function loginBuckets() {
  return globalThis.__zapflowLoginBuckets ??= new Map<string, LoginBucket>();
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function consumeLoginBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const buckets = loginBuckets();

  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  buckets.set(key, current);
  if (current.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

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

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function activeOrganizationId(memberships: Membership[]) {
  return memberships[0]?.organization_id ?? null;
}

async function getProfile(accessToken: string) {
  const { url, key } = supabasePublicConfig();
  const headers = { apikey: key, Authorization: `Bearer ${accessToken}` };

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!userResponse.ok) return null;

  const user = await userResponse.json() as { id: string; email?: string };
  const membershipResponse = await fetch(
    `${url}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(user.id)}&select=organization_id,role&order=created_at.asc`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );

  if (!membershipResponse.ok) {
    console.error("Falha ao carregar organizações", membershipResponse.status, await membershipResponse.text());
    throw new Error("Falha ao carregar organizações");
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
    signal: AbortSignal.timeout(10_000),
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
            const response = Response.json({ authenticated: false }, { status: 401 });
            response.headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
            response.headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
            return noStore(response);
          }

          const organizationId = activeOrganizationId(profile.memberships);
          if (!organizationId) {
            return noStore(Response.json({ error: "Usuário sem organização vinculada" }, { status: 403 }));
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

          return noStore(response);
        } catch (error) {
          console.error("Auth GET failed", error);
          return noStore(Response.json({ authenticated: false }, { status: 401 }));
        }
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 16_000) {
          return noStore(Response.json({ error: "Payload muito grande" }, { status: 413 }));
        }

        let body: {
          action?: "login" | "logout";
          email?: string;
          password?: string;
        } | null = null;

        try {
          body = JSON.parse(raw);
        } catch {
          return noStore(Response.json({ error: "JSON inválido" }, { status: 400 }));
        }

        if (body.action === "logout") {
          const cookies = parseCookies(request);
          const accessToken = cookies[ACCESS_COOKIE];
          if (accessToken) {
            try {
              const { url, key } = supabasePublicConfig();
              await fetch(`${url}/auth/v1/logout`, {
                method: "POST",
                headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10_000),
              });
            } catch (error) {
              console.error("Supabase logout failed", error);
            }
          }

          const response = Response.json({ ok: true });
          response.headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
          response.headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
          return noStore(response);
        }

        if (
          body.action !== "login" ||
          typeof body.email !== "string" ||
          typeof body.password !== "string" ||
          !body.email ||
          !body.password
        ) {
          return noStore(Response.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 }));
        }

        if (body.email.length > 320 || body.password.length > 1024) {
          return noStore(Response.json({ error: "Credenciais inválidas" }, { status: 400 }));
        }

        const normalizedEmail = body.email.trim().toLowerCase();
        const ip = clientIp(request);
        const ipLimit = consumeLoginBucket(`ip:${ip}`, 30, 10 * 60 * 1000);
        const pairLimit = consumeLoginBucket(`pair:${ip}:${normalizedEmail}`, 8, 10 * 60 * 1000);

        if (!ipLimit.allowed || !pairLimit.allowed) {
          const retryAfter = Math.max(ipLimit.retryAfter, pairLimit.retryAfter);
          const response = Response.json(
            { error: "Muitas tentativas. Aguarde e tente novamente." },
            { status: 429 },
          );
          response.headers.set("Retry-After", String(retryAfter));
          return noStore(response);
        }

        try {
          const { url, key } = supabasePublicConfig();
          const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { apikey: key, "Content-Type": "application/json" },
            body: JSON.stringify({
              email: normalizedEmail,
              password: body.password,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (!loginResponse.ok) {
            console.error("Supabase password login failed", loginResponse.status, await loginResponse.text());
            return noStore(Response.json({ error: "E-mail ou senha inválidos" }, { status: 401 }));
          }

          const session = await loginResponse.json() as SessionPayload;
          const profile = await getProfile(session.access_token);

          if (!profile) {
            return noStore(Response.json({ error: "Não foi possível carregar o usuário" }, { status: 401 }));
          }

          const organizationId = activeOrganizationId(profile.memberships);
          if (!organizationId) {
            return noStore(Response.json({ error: "Usuário sem organização vinculada" }, { status: 403 }));
          }

          loginBuckets().delete(`pair:${ip}:${normalizedEmail}`);

          const response = Response.json({
            authenticated: true,
            ...profile,
            activeOrganizationId: organizationId,
            authMode: "supabase",
          });
          response.headers.append("Set-Cookie", cookie(ACCESS_COOKIE, session.access_token, session.expires_in || 3600));
          response.headers.append("Set-Cookie", cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
          return noStore(response);
        } catch (error) {
          console.error("Auth POST failed", error);
          return noStore(Response.json({ error: "Falha temporária de autenticação" }, { status: 500 }));
        }
      },
    },
  },
});
