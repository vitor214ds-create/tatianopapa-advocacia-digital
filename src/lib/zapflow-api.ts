export type AuthState = {
  authenticated: boolean;
  user: { id: string; email: string | null };
  memberships: { organization_id: string; role: string }[];
  activeOrganizationId: string | null;
  authMode?: "supabase" | "local-owner";
};

export type WhatsAppAccount = {
  id: string;
  internal_name?: string | null;
  phone?: string | null;
  session_id: string;
  status?: string | null;
  connection_status?: string | null;
  session_status?: string | null;
  distribution_weight?: number | null;
  weight?: number | null;
  is_enabled?: boolean | null;
  reconnect_required?: boolean | null;
  last_seen_at?: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  eligible_recipients: number;
  rejected_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

const LOCAL_ACCESS_KEY = "zapflow_local_owner_session";
const LOCAL_EMAIL = "admin@zapflow.app";
const LOCAL_PASSWORD_SHA256 = "00a48b8af9b64b30b61ee82050760b722644a376385f37ea402aba80f5ec3244";
const LOCAL_USER_ID = "72c26158-ba53-4c98-b1bb-b6dd5432c7cf";
const LOCAL_ORGANIZATION_ID = "c3b3518d-4565-415f-99f1-a1f3c8f0487a";
const LOCAL_SESSION_MS = 12 * 60 * 60 * 1000;

type StoredLocalSession = AuthState & { expiresAt: number };

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `Erro HTTP ${response.status}`);
  return data as T;
}

async function rawFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: "include" });
}

async function protectedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let response = await rawFetch(input, init);
  if (response.status !== 401) return response;
  const refresh = await rawFetch("/api/auth");
  if (!refresh.ok) return response;
  response = await rawFetch(input, init);
  return response;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function localSession(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCESS_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredLocalSession;
    if (!session.authenticated || session.expiresAt <= Date.now()) {
      window.localStorage.removeItem(LOCAL_ACCESS_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(LOCAL_ACCESS_KEY);
    return null;
  }
}

function saveLocalSession() {
  const session: StoredLocalSession = {
    authenticated: true,
    user: { id: LOCAL_USER_ID, email: LOCAL_EMAIL },
    memberships: [{ organization_id: LOCAL_ORGANIZATION_ID, role: "OWNER" }],
    activeOrganizationId: LOCAL_ORGANIZATION_ID,
    authMode: "local-owner",
    expiresAt: Date.now() + LOCAL_SESSION_MS,
  };
  window.localStorage.setItem(LOCAL_ACCESS_KEY, JSON.stringify(session));
  return session as AuthState;
}

export async function login(email: string, password: string) {
  try {
    const response = await rawFetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    if (response.ok) {
      const auth = await json<AuthState>(response);
      if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_ACCESS_KEY);
      return auth;
    }
  } catch {
    // O fallback local abaixo mantém o acesso ao painel mesmo se o backend estiver indisponível.
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await sha256(password);
  if (normalizedEmail !== LOCAL_EMAIL || passwordHash !== LOCAL_PASSWORD_SHA256) {
    throw new Error("E-mail ou senha inválidos");
  }
  return saveLocalSession();
}

export async function getAuthState() {
  const local = localSession();
  if (local) return local;
  return json<AuthState>(await rawFetch("/api/auth"));
}

export async function logout() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_ACCESS_KEY);
  try {
    return await json<{ ok: boolean }>(await rawFetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }),
    }));
  } catch {
    return { ok: true };
  }
}

export async function listWhatsAppAccounts(organizationId: string) {
  return json<{ ok: true; accounts: WhatsAppAccount[] }>(await protectedFetch(`/api/gateway?organizationId=${encodeURIComponent(organizationId)}`));
}

export async function gatewayAction(organizationId: string, action: "create" | "qr" | "status" | "logout" | "delete", instanceName: string) {
  return json<any>(await protectedFetch("/api/gateway", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, action, instanceName }),
  }));
}

export async function listCampaigns(organizationId: string) {
  return json<{ ok: true; campaigns: Campaign[] }>(await protectedFetch(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`));
}

export async function createCampaign(input: {
  organizationId: string;
  name: string;
  message: string;
  recipients: Array<{ id?: string; name?: string; phone: string; consent: boolean; suppressed?: boolean }>;
}) {
  return json<{ ok: true; status: string; campaignId: string; eligible: number; rejected: number; sessions: number }>(await protectedFetch("/api/campaigns", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
}

export function qrImageSource(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100) return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  return null;
}
