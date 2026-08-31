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
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
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
  const auth = await rawFetch("/api/auth");
  if (!auth.ok) return response;
  return rawFetch(input, init);
}

export async function login(email: string, password: string) {
  return json<AuthState>(await rawFetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", email, password }),
  }));
}

export async function getAuthState() {
  return json<AuthState>(await rawFetch("/api/auth"));
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
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100) return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  return null;
}
