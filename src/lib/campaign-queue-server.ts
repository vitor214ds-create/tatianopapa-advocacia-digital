import { sendText } from "./gateway/evolution";

export type QueueRecipient = {
  id?: string;
  phone: string;
  consent: boolean;
  suppressed?: boolean;
  name?: string;
};

type ActiveSession = {
  id: string;
  session_id: string;
  internal_name?: string | null;
  distribution_weight?: number | null;
  weight?: number | null;
};

type ServiceJob = {
  id: string;
  campaign_id: string;
  session_id: string;
  phone: string;
  message: string;
  attempts: number;
  max_attempts: number;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function supabaseUrl() { return required("SUPABASE_URL").replace(/\/$/, ""); }

function userHeaders(request: Request) {
  const key = required("SUPABASE_ANON_KEY");
  const bearer = request.headers.get("authorization");
  const cookieToken = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith("zapflow_access_token="))?.split("=").slice(1).join("=");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : cookieToken ? decodeURIComponent(cookieToken) : null;
  if (!token) throw new Error("Sessão autenticada ausente");
  return { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

function serviceHeaders() {
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function positiveWeight(session: ActiveSession) {
  const value = Number(session.distribution_weight ?? session.weight ?? 100);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

export async function loadActiveSessions(request: Request, organizationId: string) {
  const select = encodeURIComponent("id,session_id,internal_name,distribution_weight,weight");
  const response = await fetch(`${supabaseUrl()}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&is_enabled=eq.true&connection_status=eq.CONNECTED&select=${select}&order=created_at.asc`, { headers: userHeaders(request) });
  if (!response.ok) throw new Error(`Falha ao carregar sessões conectadas: ${await response.text()}`);
  return (await response.json() as ActiveSession[]).filter(item => Boolean(item.session_id));
}

export function prepareRecipients(recipients: QueueRecipient[]) {
  const eligible = recipients.filter(r => r.consent === true && r.suppressed !== true).map(r => ({ ...r, normalizedPhone: normalizePhone(r.phone) })).filter(r => r.normalizedPhone.length >= 12 && r.normalizedPhone.length <= 15);
  return { eligible, rejected: recipients.length - eligible.length };
}

export function allocateWeighted<T extends { normalizedPhone: string }>(recipients: T[], sessions: ActiveSession[]) {
  const current = new Map<string, number>();
  const total = sessions.reduce((sum, s) => sum + positiveWeight(s), 0);
  return recipients.map(recipient => {
    let selected = sessions[0]; let best = Number.NEGATIVE_INFINITY;
    for (const session of sessions) {
      const score = (current.get(session.id) ?? 0) + positiveWeight(session);
      current.set(session.id, score);
      if (score > best) { best = score; selected = session; }
    }
    current.set(selected.id, (current.get(selected.id) ?? 0) - total);
    return { recipient, session: selected };
  });
}

export async function createQueuedCampaign(request: Request, input: { organizationId: string; name: string; message: string; createdBy: string; recipients: QueueRecipient[] }) {
  const { eligible, rejected } = prepareRecipients(input.recipients);
  if (!eligible.length) throw new Error("Nenhum destinatário elegível para a campanha");
  const sessions = await loadActiveSessions(request, input.organizationId);
  if (!sessions.length) throw new Error("Nenhuma sessão WhatsApp conectada e habilitada");
  const allocations = allocateWeighted(eligible, sessions);
  const headers = userHeaders(request);
  const campaignResponse = await fetch(`${supabaseUrl()}/rest/v1/zapflow_campaigns`, { method: "POST", headers, body: JSON.stringify({ organization_id: input.organizationId, name: input.name, message: input.message, status: "QUEUED", total_recipients: input.recipients.length, eligible_recipients: eligible.length, rejected_recipients: rejected, created_by: input.createdBy }) });
  if (!campaignResponse.ok) throw new Error(`Fila ainda não disponível no banco: ${await campaignResponse.text()}`);
  const campaign = (await campaignResponse.json() as { id: string }[])[0];
  if (!campaign?.id) throw new Error("Campanha não retornou ID");
  const jobs = allocations.map(({ recipient, session }) => ({ organization_id: input.organizationId, campaign_id: campaign.id, whatsapp_account_id: session.id, session_id: session.session_id, recipient_id: recipient.id || null, recipient_name: recipient.name || null, phone: recipient.normalizedPhone, message: input.message, status: "QUEUED", attempts: 0, max_attempts: 4, next_attempt_at: new Date().toISOString() }));
  const jobsResponse = await fetch(`${supabaseUrl()}/rest/v1/zapflow_message_jobs`, { method: "POST", headers, body: JSON.stringify(jobs) });
  if (!jobsResponse.ok) {
    await fetch(`${supabaseUrl()}/rest/v1/zapflow_campaigns?id=eq.${campaign.id}`, { method: "DELETE", headers });
    throw new Error(`Falha ao criar jobs: ${await jobsResponse.text()}`);
  }
  return { campaignId: campaign.id, eligible: eligible.length, rejected, sessions: sessions.length };
}

async function servicePatch(table: string, id: string, patch: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: serviceHeaders(), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(await response.text());
}

export async function runQueueWorker(workerId: string, limit = 20) {
  const headers = serviceHeaders();
  const claimResponse = await fetch(`${supabaseUrl()}/rest/v1/rpc/zapflow_claim_message_jobs`, { method: "POST", headers, body: JSON.stringify({ p_worker_id: workerId, p_limit: Math.max(1, Math.min(limit, 100)) }) });
  if (!claimResponse.ok) throw new Error(`Falha ao reivindicar jobs: ${await claimResponse.text()}`);
  const jobs = await claimResponse.json() as ServiceJob[];
  const touched = new Set<string>();
  let sent = 0; let retried = 0; let failed = 0;
  for (const job of jobs) {
    touched.add(job.campaign_id);
    try {
      const provider = await sendText(job.session_id, job.phone, job.message) as any;
      await servicePatch("zapflow_message_jobs", job.id, { status: "SENT", sent_at: new Date().toISOString(), provider_message_id: provider?.key?.id || provider?.messageId || null, locked_at: null, locked_by: null, last_error: null });
      sent++;
    } catch (error) {
      const final = job.attempts >= job.max_attempts;
      const delaySeconds = Math.min(900, Math.pow(2, Math.max(1, job.attempts)) * 15);
      await servicePatch("zapflow_message_jobs", job.id, { status: final ? "FAILED" : "RETRY", next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(), locked_at: null, locked_by: null, last_error: error instanceof Error ? error.message.slice(0, 2000) : "Falha inesperada" });
      final ? failed++ : retried++;
    }
  }
  for (const campaignId of touched) {
    const refresh = await fetch(`${supabaseUrl()}/rest/v1/rpc/zapflow_refresh_campaign_counters`, { method: "POST", headers, body: JSON.stringify({ p_campaign_id: campaignId }) });
    if (!refresh.ok) console.error("Falha ao atualizar campanha", campaignId, await refresh.text());
  }
  return { claimed: jobs.length, sent, retried, failed };
}
