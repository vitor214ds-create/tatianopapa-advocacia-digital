export type AuthState = {
  authenticated: boolean;
  user: { id: string; email: string | null };
  memberships: { organization_id: string; role: string }[];
  activeOrganizationId: string | null;
  authMode?: "supabase";
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
  canceled_count?: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardMetrics = {
  sent24h: number;
  failed24h: number;
  pending: number;
  replies24h: number;
};

export type MessageTemplate = {
  id: string;
  name: string;
  content: string;
  variables: string[];
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function accountConnected(account: WhatsAppAccount) {
  const state = String(account.connection_status || account.session_status || account.status || "").toUpperCase();
  return account.is_enabled !== false && !account.reconnect_required && (state === "CONNECTED" || state === "OPEN");
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { /* Some server errors are plain text. */ }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : text && !text.trim().startsWith("<") ? text.slice(0, 300) : `O servidor não conseguiu concluir a ação (${response.status}). Tente novamente.`;
    throw new ApiError(message, response.status);
  }
  if (!data || typeof data !== "object") {
    throw new ApiError("O servidor retornou uma resposta inválida. Atualize a página e tente novamente.", 502);
  }
  return data as T;
}

async function rawFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  // Authentication and gateway operations perform several upstream requests.
  // Do not abort the browser before the server's 20-second gateway timeout.
  const signal = init.signal ?? AbortSignal.timeout(60_000);
  try {
    return await fetch(input, { ...init, signal, credentials: "include", cache: "no-store" });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("A conexão demorou demais. Tente novamente.");
    }
    if (error instanceof TypeError) throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    throw error;
  }
}

async function protectedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let response = await rawFetch(input, init);
  if (response.status !== 401) return response;
  try {
    await getAuthState();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("zapflow:session-expired"));
    }
    throw error;
  }
  response = await rawFetch(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("zapflow:session-expired"));
  }
  return response;
}

export async function login(email: string, password: string) {
  return json<AuthState>(await rawFetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", email, password }),
  }));
}

// Share only an in-flight request, never a cached authenticated response.
// Parallel 401s must not race to rotate the same refresh-token cookie.
let authRequest: Promise<AuthState> | null = null;
export function getAuthState(): Promise<AuthState> {
  if (!authRequest) {
    authRequest = rawFetch("/api/auth").then(json<AuthState>).finally(() => { authRequest = null; });
  }
  return authRequest;
}

export async function logout() {
  return json<{ ok: boolean }>(await rawFetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  }));
}

export async function listWhatsAppAccounts(organizationId: string) {
  return json<{ ok: true; gatewayConfigured: boolean; gatewayBaseUrl?: string | null; accounts: WhatsAppAccount[] }>(await protectedFetch(`/api/gateway?organizationId=${encodeURIComponent(organizationId)}`));
}

export async function configureGateway(organizationId: string, baseUrl: string, apiKey: string) {
  return json<{ ok: true; gatewayConfigured: boolean; gatewayBaseUrl?: string | null }>(await protectedFetch("/api/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, action: "configure", baseUrl, apiKey }),
  }));
}

export async function gatewayAction(organizationId: string, action: "create" | "qr" | "status" | "logout" | "delete", instanceName: string) {
  return json<any>(await protectedFetch("/api/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, action, instanceName }),
  }));
}

export async function getDashboardMetrics(organizationId: string) {
  return json<{ ok: true; metrics: DashboardMetrics }>(
    await protectedFetch(`/api/dashboard?organizationId=${encodeURIComponent(organizationId)}`),
  );
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function listTemplates(organizationId: string) {
  return json<{ templates: MessageTemplate[] }>(await protectedFetch(`/api/templates?organizationId=${encodeURIComponent(organizationId)}`));
}

export async function saveTemplate(input: {
  organizationId: string;
  id?: string;
  name: string;
  content: string;
  category?: string;
}) {
  return json<{ ok: true; template: MessageTemplate }>(await protectedFetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: input.id ? "update" : "create" }),
  }));
}

export async function deleteTemplate(organizationId: string, id: string) {
  return json<{ ok: true }>(await protectedFetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, id, action: "delete" }),
  }));
}

export function qrImageSource(value?: string | null) {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100) return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  return null;
}
