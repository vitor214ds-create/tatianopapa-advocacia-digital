import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, FileText, Gauge, Menu,
  MessageCircle, MoreHorizontal, Plus, RefreshCw, Send, ShieldCheck,
  Smartphone, Sparkles, Upload, Webhook, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WhatsAppSessionManager } from "../components/whatsapp-session-manager";
import { TemplatesPage } from "../components/templates-page";
import { ChatPage } from "../components/chat-page";
import {
  createCampaign,
  getAuthState,
  getDashboardMetrics,
  listCampaigns,
  listTemplates,
  listWhatsAppAccounts,
  logout,
  type Campaign,
  type DashboardMetrics,
  type MessageTemplate,
  type WhatsAppAccount,
} from "../lib/zapflow-api";

export const Route = createFileRoute("/")({ component: ZapFlowApp });

type Section = "Dashboard" | "Campanhas" | "Templates" | "Chat" | "WhatsApp";

const nav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Dashboard", icon: Gauge },
  { label: "Campanhas", icon: Send },
  { label: "Templates", icon: FileText },
  { label: "Chat", icon: MessageCircle },
  { label: "WhatsApp", icon: Smartphone },
];

function Logo() {
  return <div className="brand">
    <div className="brand-mark"><Zap size={20} strokeWidth={2.6}/></div>
    <div><strong>ZapFlow</strong><span>Multi-session WhatsApp</span></div>
  </div>;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function Metric({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Gauge;
}) {
  return <div className="metric-card">
    <div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={18}/></div></div>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Gauge;
  title: string;
  description: string;
}) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={23}/></div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>;
}

function accountConnected(account: WhatsAppAccount) {
  const state = String(
    account.connection_status || account.session_status || account.status || "",
  ).toUpperCase();
  return state === "CONNECTED" || state === "OPEN";
}

function Dashboard({
  connected,
  organizationId,
  onOpenWhatsApp,
  onOpenCampaigns,
}: {
  connected: number;
  organizationId: string;
  onOpenWhatsApp: () => void;
  onOpenCampaigns: () => void;
}) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    sent24h: 0,
    failed24h: 0,
    pending: 0,
    replies24h: 0,
  });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await getDashboardMetrics(organizationId);
      setMetrics(response.metrics);
    } catch {
      // The rest of the dashboard remains usable even if metrics are temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [organizationId]);

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">Visão geral</span>
        <h1>Central de operações</h1>
        <p>Veja o estado real das sessões e da fila antes de iniciar qualquer campanha.</p>
      </div>
      <div className="actions">
        <button className="btn btn-soft" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar
        </button>
        <button className="btn btn-primary" onClick={onOpenCampaigns}>
          <Plus size={17}/>Nova campanha
        </button>
      </div>
    </div>

    <div className="metrics-grid">
      <Metric label="Números conectados" value={`${connected}/10`} helper="Sessões confirmadas agora" icon={Smartphone}/>
      <Metric label="Enviadas 24h" value={String(metrics.sent24h)} helper="Mensagens confirmadas como SENT" icon={Send}/>
      <Metric label="Respostas 24h" value={String(metrics.replies24h)} helper="Mensagens recebidas pelo webhook" icon={MessageCircle}/>
      <Metric label="Fila pendente" value={String(metrics.pending)} helper={metrics.failed24h ? `${metrics.failed24h} falha(s) nas últimas 24h` : "Sem falhas nas últimas 24h"} icon={AlertTriangle}/>
    </div>

    <div className="dashboard-grid">
      <section className="panel panel-main">
        <div className="panel-title">
          <div><span className="eyebrow">Checklist operacional</span><h2>Pronto para enviar?</h2></div>
          <StatusPill tone={connected ? "success" : "warning"}>
            {connected ? "Sessão ativa" : "Conecte um número"}
          </StatusPill>
        </div>
        <div className="setup-list">
          <div className="setup-row">
            <div className="setup-index done"><CheckCircle2 size={17}/></div>
            <div><strong>Autenticação e workspace</strong><span>Cookies HttpOnly, Supabase Auth e isolamento por organização.</span></div>
            <StatusPill tone="success">Pronto</StatusPill>
          </div>
          <div className="setup-row">
            <div className={`setup-index ${connected ? "done" : ""}`}>{connected ? <CheckCircle2 size={17}/> : 2}</div>
            <div><strong>Número WhatsApp conectado</strong><span>Somente sessões realmente CONNECTED entram na distribuição.</span></div>
            <button className="btn btn-soft" onClick={onOpenWhatsApp}>Gerenciar</button>
          </div>
          <div className="setup-row">
            <div className="setup-index done"><CheckCircle2 size={17}/></div>
            <div><strong>Proteções de envio</strong><span>Opt-out, deduplicação, retry, fila persistente e limite de 150 envios por sessão/24h.</span></div>
            <StatusPill tone="success">Ativas</StatusPill>
          </div>
        </div>
      </section>

      <section className="panel health-card">
        <div className="panel-title"><div><span className="eyebrow">Saúde</span><h2>Gateway</h2></div><Webhook size={19}/></div>
        <div className="health-score">
          <div className="score-ring"><span>{connected}</span></div>
          <div>
            <strong>{connected ? "Sessões disponíveis para a fila" : "Nenhuma sessão conectada"}</strong>
            <p>{connected ? "Você pode criar campanhas com contatos autorizados." : "Reconecte pelo QR antes de criar a primeira campanha."}</p>
          </div>
        </div>
        <div className="health-lines">
          <span><i className="dot ok"/>Autenticação</span>
          <span><i className={connected ? "dot ok" : "dot wait"}/>WhatsApp</span>
          <span><i className="dot ok"/>Worker e fila</span>
        </div>
      </section>
    </div>
  </>;
}


type ParsedContact = { name?: string; phone: string };

function splitContactLine(line: string, delimiter: string | null) {
  if (!delimiter) return [line.trim()];
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseContactText(raw: string): { rows: ParsedContact[]; canonical: string } {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return { rows: [], canonical: "" };

  const candidates = [";", "\t", ",", "|"];
  const sample = lines[0];
  const delimiter = candidates
    .map(value => ({ value, count: sample.split(value).length - 1 }))
    .sort((a, b) => b.count - a.count)[0];
  const selectedDelimiter = delimiter?.count ? delimiter.value : null;

  const firstFields = splitContactLine(lines[0], selectedDelimiter);
  const normalizedHeaders = firstFields.map(normalizeHeader);
  const phoneNames = new Set(["telefone", "phone", "celular", "whatsapp", "numero", "fone"]);
  const nameNames = new Set(["nome", "name", "cliente", "contato"]);
  const phoneHeaderIndex = normalizedHeaders.findIndex(value => phoneNames.has(value));
  const nameHeaderIndex = normalizedHeaders.findIndex(value => nameNames.has(value));
  const hasHeader = phoneHeaderIndex >= 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines
    .map(line => {
      const fields = splitContactLine(line, selectedDelimiter).map(value => value.trim());
      if (!fields.length) return null;
      const phoneIndex = hasHeader ? phoneHeaderIndex : Math.max(0, fields.length - 1);
      const nameIndex = hasHeader ? nameHeaderIndex : fields.length > 1 ? 0 : -1;
      const phone = (fields[phoneIndex] || "").trim();
      const name = nameIndex >= 0 ? (fields[nameIndex] || "").trim() : "";
      if (!phone) return null;
      return name ? { name, phone } : { phone };
    })
    .filter((row): row is ParsedContact => Boolean(row));

  return {
    rows,
    canonical: rows.map(row => row.name ? row.name + ";" + row.phone : row.phone).join("\n"),
  };
}

function minimumScheduleValue() {
  const date = new Date(Date.now() + 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CampaignsPage({
  accounts,
  organizationId,
}: {
  accounts: WhatsAppAccount[];
  organizationId: string;
}) {
  const active = accounts.filter(accountConnected);
  const [previewTotal, setPreviewTotal] = useState(103);
  const [creating, setCreating] = useState(true);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"now" | "scheduled">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [scheduledEndLocal, setScheduledEndLocal] = useState("");
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parsedInput = useMemo(() => parseContactText(recipientText), [recipientText]);
  const safeTotal = Math.max(
    0,
    Math.min(
      parsedInput.rows.length > 0
        ? parsedInput.rows.length
        : Number.isFinite(previewTotal) ? previewTotal : 0,
      5000,
    ),
  );
  const allocation = active.length
    ? active.map((account, index) => ({
        account,
        jobs: Math.floor(safeTotal / active.length) + (index < safeTotal % active.length ? 1 : 0),
      }))
    : [];
  const values = allocation.map(item => item.jobs);
  const difference = values.length ? Math.max(...values) - Math.min(...values) : 0;
  const inputLines = parsedInput.rows.length;
  const theoreticalCapacity = active.length * 150;

  async function refreshCampaigns() {
    try {
      const response = await listCampaigns(organizationId);
      setCampaigns(response.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar campanhas.");
    }
  }

  async function refreshTemplates() {
    try {
      const response = await listTemplates(organizationId);
      setTemplates((response.templates || []).filter(template => template.is_active !== false));
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    void refreshCampaigns();
    void refreshTemplates();
  }, [organizationId]);

  function parseRecipients() {
    return parsedInput.rows.map(row => ({
      ...row,
      consent: consentConfirmed,
    }));
  }

  function applyTemplate(id: string) {
    if (!id) return;
    const template = templates.find(item => item.id === id);
    if (!template) return;
    setMessage(template.content);
    if (!name.trim()) setName(template.name);
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("O arquivo deve ter no máximo 2 MB.");
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".txt") && !lowerName.endsWith(".csv") && !lowerName.endsWith(".tsv")) {
      setError("Envie um arquivo TXT, CSV ou TSV.");
      return;
    }

    setReadingFile(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const parsed = parseContactText(text);
      if (!parsed.rows.length) {
        setError("Nenhum contato foi encontrado no arquivo.");
        return;
      }
      if (parsed.rows.length > 5000) {
        setError("O arquivo possui mais de 5.000 contatos. Divida a lista em campanhas menores.");
        return;
      }
      setRecipientText(parsed.canonical);
      setPreviewTotal(parsed.rows.length);
      setImportedFileName(file.name);
      setSuccess(parsed.rows.length + " contato(s) importado(s) de " + file.name + ".");
    } catch {
      setError("Não foi possível ler o arquivo.");
    } finally {
      setReadingFile(false);
    }
  }

  async function submitCampaign() {
    setError(null);
    setSuccess(null);

    if (!active.length) {
      setError("Conecte pelo menos um número antes de criar uma campanha.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Informe um nome para a campanha.");
      return;
    }
    if (!message.trim()) {
      setError("Escreva a mensagem da campanha.");
      return;
    }

    const unsupported = [...message.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
      .map(match => match[1].toLowerCase())
      .find(variable => !["nome", "telefone"].includes(variable));
    if (unsupported) {
      setError("Variável não suportada: {{" + unsupported + "}}. Use apenas {{nome}} e {{telefone}}.");
      return;
    }
    if (!parsedInput.rows.length) {
      setError("Cole ou importe pelo menos um destinatário.");
      return;
    }
    if (!consentConfirmed) {
      setError("Confirme que os destinatários autorizaram o recebimento das mensagens.");
      return;
    }

    const recipients = parseRecipients();
    if (recipients.length > 5000) {
      setError("Cada campanha aceita no máximo 5.000 contatos.");
      return;
    }

    if (recipients.length > theoreticalCapacity) {
      setError(
        "A lista possui " + recipients.length + " contatos, mas " + active.length +
        " número(s) conectado(s) comportam no máximo " + theoreticalCapacity +
        " envios dentro do limite de 150 por sessão/24h.",
      );
      return;
    }

    let scheduledAt: string | undefined;
    let scheduledEndAt: string | undefined;
    if (deliveryMode === "scheduled") {
      if (!scheduledLocal || !scheduledEndLocal) {
        setError("Escolha a data/hora de início e a data/hora de término.");
        return;
      }
      const scheduledDate = new Date(scheduledLocal);
      const scheduledEndDate = new Date(scheduledEndLocal);
      if (Number.isNaN(scheduledDate.getTime()) || Number.isNaN(scheduledEndDate.getTime())) {
        setError("Data ou horário de agendamento inválido.");
        return;
      }
      if (scheduledDate.getTime() <= Date.now() + 30_000) {
        setError("O agendamento precisa começar pelo menos 30 segundos no futuro.");
        return;
      }
      if (scheduledEndDate.getTime() <= scheduledDate.getTime()) {
        setError("O horário final precisa ser posterior ao horário inicial.");
        return;
      }
      if (scheduledEndDate.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
        setError("A janela de envio deve estar dentro dos próximos 12 meses.");
        return;
      }
      scheduledAt = scheduledDate.toISOString();
      scheduledEndAt = scheduledEndDate.toISOString();
    }

    setSaving(true);
    try {
      const result = await createCampaign({
        organizationId,
        name: name.trim(),
        message: message.trim(),
        recipients,
        scheduledAt,
        scheduledEndAt,
      });
      const scheduleText = result.scheduledAt
        ? " Janela: " + new Date(result.scheduledAt).toLocaleString("pt-BR") +
          (result.scheduledEndAt ? " até " + new Date(result.scheduledEndAt).toLocaleString("pt-BR") : "") + "."
        : "";
      setSuccess(
        "Campanha criada: " + result.eligible + " elegíveis, " + result.rejected +
        " rejeitados e " + result.sessions + " sessão(ões) participantes." + scheduleText,
      );
      setCreating(true);
      setName("");
      setMessage("");
      setRecipientText("");
      setConsentConfirmed(false);
      setDeliveryMode("now");
      setScheduledLocal("");
      setScheduledEndLocal("");
      setImportedFileName(null);
      await refreshCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a campanha.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">Operação</span>
        <h1>Campanhas</h1>
        <p>Importe contatos por arquivo, programe a data e hora e acompanhe a fila de envio.</p>
      </div>
      <button className="btn btn-primary" onClick={() => setCreating(true)}>
        <Upload size={17}/>Importar TXT / criar campanha
      </button>
    </div>

    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {success && <div className="notice"><CheckCircle2 size={20}/><div><strong>Operação concluída</strong><p>{success}</p></div></div>}

    {creating && <section className="panel mb-4">
      <div className="panel-title">
        <div><span className="eyebrow">Campanha completa</span><h2>Importar contatos e programar disparo</h2></div>
        <button className="btn btn-soft" onClick={() => setCreating(false)}><X size={16}/>Ocultar</button>
      </div>

      <div className="grid gap-4 p-4">
        {templates.length > 0 && <label className="grid gap-1.5 text-sm font-medium text-[#304237]">
          Usar template
          <select
            className="h-11 rounded-xl border border-[#dfe7e1] bg-white px-3 outline-none focus:border-[#269451]"
            defaultValue=""
            onChange={event => applyTemplate(event.target.value)}
          >
            <option value="">Escrever mensagem manualmente</option>
            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>}

        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">
          Nome da campanha
          <input
            className="h-11 rounded-xl border border-[#dfe7e1] px-3 outline-none focus:border-[#269451]"
            maxLength={120}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Ex.: Retorno clientes setembro"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">
          Mensagem
          <textarea
            className="min-h-32 rounded-xl border border-[#dfe7e1] p-3 outline-none focus:border-[#269451]"
            maxLength={4000}
            value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder="Olá {{nome}}, tudo bem?"
          />
          <span className="text-[11px] font-normal text-[#829087]">
            Variáveis disponíveis: {"{{nome}}"} e {"{{telefone}}"}. Se o nome não for informado, {"{{nome}}"} vira “cliente”.
          </span>
        </label>

        <div className="grid gap-2 rounded-xl border border-[#dfe7e1] bg-[#fbfcfb] p-4">
          <span className="text-sm font-medium text-[#304237]">Quando enviar</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={deliveryMode === "now" ? "btn btn-primary justify-center" : "btn btn-soft justify-center"}
              aria-pressed={deliveryMode === "now"}
              onClick={() => setDeliveryMode("now")}
            >
              <Send size={16}/>Enviar agora
            </button>
            <button
              type="button"
              className={deliveryMode === "scheduled" ? "btn btn-primary justify-center" : "btn btn-soft justify-center"}
              aria-pressed={deliveryMode === "scheduled"}
              onClick={() => setDeliveryMode("scheduled")}
            >
              <CalendarClock size={16}/>Programar envio
            </button>
          </div>
          {deliveryMode === "scheduled" && <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-[#304237]">
              Início dos disparos
              <input
                type="datetime-local"
                min={minimumScheduleValue()}
                value={scheduledLocal}
                onChange={event => setScheduledLocal(event.target.value)}
                className="h-11 rounded-xl border border-[#dfe7e1] bg-white px-3 outline-none focus:border-[#269451]"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#304237]">
              Término dos disparos
              <input
                type="datetime-local"
                min={scheduledLocal || minimumScheduleValue()}
                value={scheduledEndLocal}
                onChange={event => setScheduledEndLocal(event.target.value)}
                className="h-11 rounded-xl border border-[#dfe7e1] bg-white px-3 outline-none focus:border-[#269451]"
              />
            </label>
            <span className="text-[11px] font-normal text-[#829087] sm:col-span-2">
              Os contatos são distribuídos em round-robin entre todos os números conectados e espaçados ao longo da janela escolhida.
            </span>
          </div>}
        </div>

        <div className="grid gap-2 rounded-xl border border-[#dfe7e1] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="block text-sm font-medium text-[#304237]">1. Carregar lista de contatos</span>
              <span className="text-[11px] text-[#829087]">Selecione um TXT, CSV ou TSV. Um número por linha também funciona.</span>
            </div>
            <label className="btn btn-soft cursor-pointer">
              <Upload size={15}/>{readingFile ? "Lendo arquivo..." : "Carregar arquivo TXT/CSV"}
              <input
                id="campaign-contact-file"
                type="file"
                accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"
                className="hidden"
                disabled={readingFile}
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void importFile(file);
                }}
              />
            </label>
          </div>

          {importedFileName && <div className="rounded-lg bg-[#eef8f1] px-3 py-2 text-xs text-[#287044]">
            <strong>{importedFileName}</strong> carregado com {inputLines} contato(s).
          </div>}

          <textarea
            className="min-h-44 rounded-xl border border-[#dfe7e1] p-3 font-mono text-xs outline-none focus:border-[#269451]"
            value={recipientText}
            onChange={event => {
              setRecipientText(event.target.value);
              setImportedFileName(null);
            }}
            placeholder={"27999999999\nMaria;27988888888"}
          />
          <span className="text-[11px] text-[#829087]">
            {inputLines} contato(s) reconhecido(s). Cabeçalhos como nome, telefone, celular, WhatsApp e phone são detectados automaticamente.
          </span>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-[#dfe7e1] bg-[#f8faf8] p-3 text-sm text-[#526158]">
          <input
            type="checkbox"
            className="mt-1"
            checked={consentConfirmed}
            onChange={event => setConsentConfirmed(event.target.checked)}
          />
          <span>Confirmo que estes destinatários autorizaram o recebimento das mensagens. Opt-outs persistentes também são bloqueados novamente pelo backend antes do envio.</span>
        </label>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <strong>Distribuição automática:</strong> contato 1 → número 1, contato 2 → número 2, contato 3 → número 3 e assim sucessivamente, reiniciando o ciclo.
          Com {active.length} número(s) conectado(s), a capacidade teórica desta campanha é de até <strong>{theoreticalCapacity}</strong> mensagens,
          respeitando o limite de 150 por sessão em 24 horas, opt-out e disponibilidade real das sessões.
        </div>

        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={saving} onClick={() => void submitCampaign()}>
            {saving ? "Salvando..." : deliveryMode === "scheduled" ? "Programar campanha" : "Criar e enfileirar campanha"}
          </button>
        </div>
      </div>
    </section>}

    <section className="panel mb-4">
      <div className="panel-title">
        <div><span className="eyebrow">Distribuidor equilibrado</span><h2>Prévia da divisão</h2></div>
        <StatusPill tone={active.length ? "success" : "warning"}>{active.length} sessões ativas</StatusPill>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-[#edf1ee] p-4">
        <label className="grid gap-1 text-xs font-semibold text-[#66756b]">
          Quantidade de destinatários
          <input
            type="number"
            min={0}
            max={5000}
            value={previewTotal}
            onChange={event => setPreviewTotal(Math.max(0, Math.min(5000, Number(event.target.value) || 0)))}
            className="h-10 w-44 rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none"
          />
        </label>
        <div className="text-xs text-[#718077]">
          Diferença máxima entre números: <strong>{difference}</strong> mensagem. A fila real usa round-robin.
        </div>
      </div>
      {active.length
        ? <div className="grid grid-cols-2 gap-3 p-4 max-[700px]:grid-cols-1">
            {allocation.map(({ account, jobs }) => <div key={account.id} className="flex items-center justify-between rounded-xl border border-[#e5ebe6] p-4">
              <div>
                <strong className="block text-sm text-[#2a3c30]">{account.internal_name || account.session_id}</strong>
                <span className="mt-1 block text-[11px] text-[#87958c]">{account.phone || "Telefone conectado"}</span>
              </div>
              <strong className="text-lg text-[#159447]">{jobs} jobs</strong>
            </div>)}
          </div>
        : <EmptyState icon={Smartphone} title="Nenhuma sessão ativa" description="Conecte pelo menos um número por QR antes de criar a campanha."/>}
    </section>

    <section className="panel">
      <div className="panel-title">
        <div><span className="eyebrow">Fila persistente</span><h2>Campanhas recentes</h2></div>
        <button className="btn btn-soft" onClick={() => void refreshCampaigns()}><RefreshCw size={15}/>Atualizar</button>
      </div>
      {campaigns.length
        ? <div className="grid gap-2 p-4">
            {campaigns.slice(0, 20).map(campaign => {
              const isScheduled = Boolean(
                campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now() + 1000,
              );
              return <div key={campaign.id} className="grid gap-2 rounded-xl border border-[#e5ebe6] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <strong className="block text-sm text-[#2a3c30]">{campaign.name}</strong>
                  <span className="text-[11px] text-[#87958c]">
                    {campaign.eligible_recipients} elegíveis • {campaign.rejected_recipients} rejeitados
                    {isScheduled
                      ? " • Janela " + new Date(campaign.scheduled_at as string).toLocaleString("pt-BR") +
                        (campaign.scheduled_end_at ? " até " + new Date(campaign.scheduled_end_at).toLocaleString("pt-BR") : "")
                      : ""}
                  </span>
                </div>
                <StatusPill tone={campaign.status === "COMPLETED" ? "success" : campaign.status === "FAILED" ? "warning" : "neutral"}>
                  {isScheduled ? "PROGRAMADA" : campaign.status}
                </StatusPill>
                <span className="text-xs text-[#526158]">{campaign.sent_count} enviadas • {campaign.failed_count} falhas • {campaign.canceled_count || 0} canceladas</span>
              </div>;
            })}
          </div>
        : <EmptyState icon={Send} title="Nenhuma campanha criada" description="Crie a primeira campanha depois de conectar um número e validar seus contatos."/>}
    </section>
  </>;
}

function ZapFlowApp() {
  const navigateRouter = useNavigate();
  const [section, setSection] = useState<Section>("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState("OWNER");
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const title = useMemo(() => section, [section]);
  const connected = accounts.filter(accountConnected).length;

  useEffect(() => {
    getAuthState()
      .then(async auth => {
        if (!auth.activeOrganizationId) {
          navigateRouter({ to: "/login" });
          return;
        }
        setOrganizationId(auth.activeOrganizationId);
        setEmail(auth.user.email);
        setRole(auth.memberships.find(member => member.organization_id === auth.activeOrganizationId)?.role || "MEMBER");
        try {
          const response = await listWhatsAppAccounts(auth.activeOrganizationId);
          setAccounts(response.accounts || []);
        } catch {
          // WhatsApp page will display the detailed gateway error.
        }
        setLoadingAuth(false);
      })
      .catch(() => navigateRouter({ to: "/login" }));
  }, [navigateRouter]);

  async function refreshAccounts() {
    if (!organizationId) return;
    try {
      const response = await listWhatsAppAccounts(organizationId);
      setAccounts(response.accounts || []);
    } catch {
      // Keep the latest known state and let the dedicated page surface the error.
    }
  }

  async function signOut() {
    await logout().catch(() => undefined);
    navigateRouter({ to: "/login" });
  }

  const navigate = (label: Section) => {
    setSection(label);
    setMobileOpen(false);
    if (label !== "WhatsApp") void refreshAccounts();
  };

  if (loadingAuth) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f7f4] text-[#526158]">
      <div className="text-center"><Zap size={30} className="mx-auto mb-3 text-[#269451]"/><strong>Carregando ZapFlow...</strong></div>
    </main>;
  }
  if (!organizationId) return null;

  const initials = (email || "ZF").split("@")[0].slice(0, 2).toUpperCase();

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-top">
        <Logo/>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={20}/></button>
      </div>

      <div className="workspace-switch">
        <div className="workspace-avatar">Z</div>
        <div><span>Workspace</span><strong>ZapFlow</strong></div>
        <ChevronDown size={16}/>
      </div>

      <nav>
        {nav.map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => navigate(label)}>
          <Icon size={18}/><span>{label}</span>
        </button>)}
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <Sparkles size={18}/>
          <strong>Sessões WhatsApp</strong>
          <span>{connected ? `${connected} número(s) conectado(s) ao gateway.` : "Nenhum número conectado. Gere um novo QR antes de enviar."}</span>
          <button onClick={() => navigate("WhatsApp")}>Gerenciar sessões</button>
        </div>
        <button className="account-row" onClick={() => void signOut()} title="Sair">
          <div className="avatar">{initials}</div>
          <div><strong>{email || "Minha conta"}</strong><span>{role} • clique para sair</span></div>
          <MoreHorizontal size={17}/>
        </button>
      </div>
    </aside>

    {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"/>}

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button>
          <div><span>ZapFlow</span><strong>{title}</strong></div>
        </div>
        <div className="topbar-actions">
          <StatusPill tone={connected ? "success" : "warning"}>{connected ? `${connected} conectado(s)` : "WhatsApp desconectado"}</StatusPill>
          <button className="profile-btn" onClick={() => void signOut()} title="Sair">{initials}</button>
        </div>
      </header>

      <div className="content-wrap">
        {section === "Dashboard" && <Dashboard
          connected={connected}
          organizationId={organizationId}
          onOpenWhatsApp={() => navigate("WhatsApp")}
          onOpenCampaigns={() => navigate("Campanhas")}
        />}
        {section === "Campanhas" && <CampaignsPage accounts={accounts} organizationId={organizationId}/>}
        {section === "Templates" && <TemplatesPage organizationId={organizationId}/>}
        {section === "Chat" && <ChatPage organizationId={organizationId}/>}
        {section === "WhatsApp" && <WhatsAppSessionManager organizationId={organizationId} onConnectedCountChange={() => void refreshAccounts()}/>}

        <footer className="app-footer">
          <span><ShieldCheck size={12}/>ZapFlow • operação protegida por fila persistente</span>
          <span>150 envios/sessão/24h • até 10 sessões</span>
        </footer>
      </div>
    </main>
  </div>;
}
