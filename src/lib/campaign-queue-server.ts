import { serverFetch } from "./request-utils";
import { sendText } from "./gateway/evolution";
import { runtimeEnv, supabasePublicConfig } from "./runtime-env";

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
};

type ServiceJob = {
  id: string;
  organization_id: string;
  campaign_id: string;
  session_id: string;
  phone: string;
  message: string;
  attempts: number;
  max_attempts: number;
};

function supabaseUrl() {
  return supabasePublicConfig().url;
}

function userHeaders(request: Request) {
  const key = supabasePublicConfig().key;
  const bearer = request.headers.get("authorization");
  const cookieToken = (request.headers.get("cookie") || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith("zapflow_access_token="))
    ?.split("=")
    .slice(1)
    .join("=");
  const token = bearer?.startsWith("Bearer ")
    ? bearer.slice(7)
    : cookieToken
      ? decodeURIComponent(cookieToken)
      : null;
  if (!token) throw new Error("Sessão autenticada ausente");
  return {
    apikey: key,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function workerHeaders() {
  const key = supabasePublicConfig().key;
  return {
    apikey: key,
    "Content-Type": "application/json",
  };
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55")) return digits;
  return digits;
}

export async function loadActiveSessions(request: Request, organizationId: string) {
  const select = encodeURIComponent("id,session_id,internal_name");
  const response = await serverFetch(
    `${supabaseUrl()}/rest/v1/whatsapp_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&is_enabled=eq.true&connection_status=eq.CONNECTED&select=${select}&order=created_at.asc`,
    { headers: userHeaders(request) },
  );
  if (!response.ok) {
    throw new Error(`Falha ao carregar sessões conectadas: ${await response.text()}`);
  }
  return (await response.json() as ActiveSession[]).filter(item => Boolean(item.session_id));
}

export function prepareRecipients(recipients: QueueRecipient[]) {
  const unique = new Map<string, QueueRecipient & { normalizedPhone: string }>();
  let rejected = 0;

  for (const recipient of recipients) {
    if (recipient.consent !== true || recipient.suppressed === true) {
      rejected++;
      continue;
    }
    const normalizedPhone = normalizePhone(recipient.phone);
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      rejected++;
      continue;
    }
    if (unique.has(normalizedPhone)) {
      rejected++;
      continue;
    }
    unique.set(normalizedPhone, { ...recipient, normalizedPhone });
  }

  return { eligible: [...unique.values()], rejected };
}

async function filterPersistentSuppressions(
  request: Request,
  organizationId: string,
  recipients: Array<QueueRecipient & { normalizedPhone: string }>,
) {
  if (!recipients.length) return { eligible: recipients, rejected: 0 };

  const response = await serverFetch(
    `${supabaseUrl()}/rest/v1/rpc/zapflow_get_suppressed_phones`,
    {
      method: "POST",
      headers: userHeaders(request),
      body: JSON.stringify({
        p_organization_id: organizationId,
        p_phones: recipients.map(item => item.normalizedPhone),
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("Falha ao consultar supressões persistentes", response.status, detail);
    throw new Error("Não foi possível validar a lista de supressão");
  }

  const rows = await response.json() as Array<{ phone: string }>;
  const suppressed = new Set(rows.map(row => row.phone));
  return {
    eligible: recipients.filter(item => !suppressed.has(item.normalizedPhone)),
    rejected: recipients.filter(item => suppressed.has(item.normalizedPhone)).length,
  };
}

export function renderRecipientMessage(
  template: string,
  recipient: QueueRecipient & { normalizedPhone: string },
) {
  const rendered = template
    .replace(/{{\s*nome\s*}}/gi, () => recipient.name?.trim() || "cliente")
    .replace(/{{\s*telefone\s*}}/gi, recipient.normalizedPhone);

  const unresolved = rendered.match(/{{\s*[a-zA-Z0-9_]+\s*}}/);
  if (unresolved) {
    throw new Error(`Variável de template não suportada: ${unresolved[0]}`);
  }

  if (!rendered.trim() || rendered.length > 4000) {
    throw new Error("Mensagem personalizada inválida");
  }

  return rendered;
}

export function allocateEvenly<T extends { normalizedPhone: string }>(
  recipients: T[],
  sessions: ActiveSession[],
) {
  if (!sessions.length) {
    return [] as Array<{ recipient: T; session: ActiveSession; sessionSequence: number }>;
  }
  const counters = new Map<string, number>();
  return recipients.map((recipient, index) => {
    const session = sessions[index % sessions.length]!;
    const sessionSequence = counters.get(session.id) ?? 0;
    counters.set(session.id, sessionSequence + 1);
    return { recipient, session, sessionSequence };
  });
}

function perSessionGapMs() {
  const configured = Number(runtimeEnv("CAMPAIGN_SEND_DELAY_MS") || 15000);
  return Number.isFinite(configured)
    ? Math.max(10000, Math.min(configured, 120000))
    : 15000;
}

export async function createQueuedCampaign(
  request: Request,
  input: {
    organizationId: string;
    name: string;
    message: string;
    createdBy: string;
    recipients: QueueRecipient[];
  },
) {
  const prepared = prepareRecipients(input.recipients);
  const persistent = await filterPersistentSuppressions(
    request,
    input.organizationId,
    prepared.eligible,
  );
  const eligible = persistent.eligible;
  const rejected = prepared.rejected + persistent.rejected;
  if (!eligible.length) throw new Error("Nenhum destinatário elegível para a campanha");

  const sessions = await loadActiveSessions(request, input.organizationId);
  if (!sessions.length) throw new Error("Nenhuma sessão WhatsApp conectada e habilitada");

  const allocations = allocateEvenly(eligible, sessions);
  const headers = userHeaders(request);

  const gap = perSessionGapMs();
  const startedAt = Date.now();

  const jobs = allocations.map(({ recipient, session, sessionSequence }) => ({
    whatsapp_account_id: session.id,
    session_id: session.session_id,
    recipient_id: recipient.id || null,
    recipient_name: recipient.name || null,
    phone: recipient.normalizedPhone,
    message: renderRecipientMessage(input.message, recipient),
    next_attempt_at: new Date(startedAt + sessionSequence * gap).toISOString(),
    max_attempts: 3,
  }));

  const atomicResponse = await serverFetch(
    `${supabaseUrl()}/rest/v1/rpc/zapflow_create_campaign_with_jobs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_organization_id: input.organizationId,
        p_name: input.name,
        p_message: input.message,
        p_total_recipients: input.recipients.length,
        p_eligible_recipients: eligible.length,
        p_rejected_recipients: rejected,
        p_jobs: jobs,
      }),
    },
  );

  if (!atomicResponse.ok) {
    const detail = await atomicResponse.text();
    console.error("Falha na criação atômica de campanha", detail);
    throw new Error("Não foi possível criar a campanha e sua fila.");
  }

  const campaignId = await atomicResponse.json() as string;
  if (!campaignId) throw new Error("Campanha não retornou ID");

  const allocation = sessions.map(session => ({
    sessionId: session.session_id,
    jobs: allocations.filter(item => item.session.id === session.id).length,
  }));

  return {
    campaignId,
    eligible: eligible.length,
    rejected,
    sessions: sessions.length,
    allocation,
    perSessionGapMs: gap,
  };
}

async function workerGatewayConfig(organizationId: string, workerSecret: string) {
  const response = await serverFetch(
    `${supabaseUrl()}/rest/v1/rpc/zapflow_get_gateway_config_for_worker`,
    {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({
        p_organization_id: organizationId,
        p_secret: workerSecret,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401 || response.status === 403 || detail.includes("unauthorized")) {
      throw new Error("Worker não autorizado");
    }
    console.error("Falha ao carregar gateway da organização", response.status, detail);
    throw new Error("Não foi possível carregar a configuração da Evolution");
  }

  const rows = await response.json() as Array<{ base_url?: string | null; api_key?: string | null }>;
  const row = rows[0];
  if (row?.base_url && row?.api_key) {
    return { baseUrl: row.base_url, apiKey: row.api_key };
  }

  return null;
}

async function finishJob(
  job: ServiceJob,
  workerId: string,
  workerSecret: string,
  input: {
    success: boolean;
    providerMessageId?: string | null;
    error?: string | null;
    retryAt?: string | null;
  },
) {
  const maxAttempts = input.success ? 2 : 1;
  let lastError = "Falha ao finalizar job";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await serverFetch(
        `${supabaseUrl()}/rest/v1/rpc/zapflow_finish_message_job_secure`,
        {
          method: "POST",
          headers: workerHeaders(),
          body: JSON.stringify({
            p_job_id: job.id,
            p_worker_id: workerId,
            p_success: input.success,
            p_provider_message_id: input.providerMessageId || null,
            p_error: input.error || null,
            p_retry_at: input.retryAt || null,
            p_secret: workerSecret,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        lastError = `Falha ao finalizar job: ${await response.text()}`;
        if (attempt < maxAttempts) continue;
        throw new Error(lastError);
      }

      const finalized = Boolean(await response.json());
      if (!finalized) {
        throw new Error("Job não pôde ser finalizado porque o lock não pertence mais a este worker");
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha ao finalizar job";
      if (attempt >= maxAttempts) throw new Error(lastError);
    }
  }
}

export async function runQueueWorker(workerId: string, limit = 20, workerSecret?: string) {
  if (!workerSecret) throw new Error("Segredo do worker ausente");

  const claimResponse = await serverFetch(
    `${supabaseUrl()}/rest/v1/rpc/zapflow_claim_message_jobs_secure`,
    {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({
        p_worker_id: workerId,
        p_limit: Math.max(1, Math.min(limit, 50)),
        p_secret: workerSecret,
      }),
    },
  );

  if (!claimResponse.ok) {
    const detail = await claimResponse.text();
    if (claimResponse.status === 401 || claimResponse.status === 403 || detail.includes("unauthorized")) {
      throw new Error("Worker não autorizado");
    }
    throw new Error(`Falha ao reivindicar jobs: ${detail}`);
  }

  const jobs = await claimResponse.json() as ServiceJob[];
  let sent = 0;
  let retried = 0;
  let failed = 0;

  const gatewayCache = new Map<string, { baseUrl: string; apiKey: string } | null>();

  for (const job of jobs) {
    try {
      let gatewayConfig = gatewayCache.get(job.organization_id);
      if (gatewayConfig === undefined) {
        gatewayConfig = await workerGatewayConfig(job.organization_id, workerSecret);
        gatewayCache.set(job.organization_id, gatewayConfig);
      }

      const provider = await sendText(
        job.session_id,
        job.phone,
        job.message,
        gatewayConfig,
      ) as any;
      await finishJob(job, workerId, workerSecret, {
        success: true,
        providerMessageId: provider?.key?.id || provider?.messageId || null,
      });
      sent++;
    } catch (error) {
      const final = job.attempts >= job.max_attempts;
      const delaySeconds = Math.min(
        1800,
        Math.pow(2, Math.max(1, job.attempts)) * 30,
      );
      await finishJob(job, workerId, workerSecret, {
        success: false,
        error: error instanceof Error ? error.message.slice(0, 2000) : "Falha inesperada",
        retryAt: final
          ? null
          : new Date(Date.now() + delaySeconds * 1000).toISOString(),
      });
      final ? failed++ : retried++;
    }
  }

  return { claimed: jobs.length, sent, retried, failed };
}
