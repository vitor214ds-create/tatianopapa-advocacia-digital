import { accountLabel } from "../lib/gateway/accounts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, Phone, QrCode, RefreshCw, Settings2, Smartphone, Trash2, Unplug } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { configureGateway, gatewayAction, listWhatsAppAccounts, qrCodeText, qrImageSource, type WhatsAppAccount } from "../lib/zapflow-api";

type Props = { organizationId: string; onConnectedCountChange?: (count: number) => void; onOpenChat?: (sessionId: string) => void };
type Connection = { instanceName: string; label: string; mode: "qr" | "phone"; phone: string; qr: string | null; qrText: string | null; code: string | null; loading: boolean; error: string | null };
const MAX_SESSIONS = 10;
function connected(account: WhatsAppAccount) { return ["OPEN", "CONNECTED"].includes(String(account.connection_status || account.session_status || account.status).toUpperCase()); }
export function WhatsAppSessionManager({ organizationId, onConnectedCountChange, onOpenChat }: Props) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [configured, setConfigured] = useState(false);
  const [configUrl, setConfigUrl] = useState("");
  const [configKey, setConfigKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Connection | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const refreshFlight = useRef<Promise<void> | null>(null);
  const count = accounts.filter(connected).length;
  const connectedCallback = useRef(onConnectedCountChange);
  connectedCallback.current = onConnectedCountChange;
  useEffect(() => { connectedCallback.current?.(count); }, [count]);

  const refresh = useCallback(() => {
    if (refreshFlight.current) return refreshFlight.current;
    refreshFlight.current = listWhatsAppAccounts(organizationId).then(data => {
      if (!alive.current) return;
      setAccounts(data.accounts || []); setConfigured(data.gatewayConfigured);
      setConfigUrl(current => current || data.gatewayBaseUrl || "");
      setError(data.gatewayError || null);
    }).catch(err => { if (alive.current) setError(err.message); }).finally(() => {
      refreshFlight.current = null; if (alive.current) setLoading(false);
    });
    return refreshFlight.current;
  }, [organizationId]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    return () => { alive.current = false; generation.current++; clearInterval(interval); if (timer.current) clearTimeout(timer.current); };
  }, [refresh]);

  function close() { generation.current++; if (timer.current) clearTimeout(timer.current); setModal(null); setBusy(false); }
  function open(instanceName: string, label: string, mode: "qr" | "phone") {
    close();
    const next: Connection = { instanceName, label, mode, phone: "", qr: null, qrText: null, code: null, loading: false, error: null };
    setModal(next);
    if (mode === "qr") void connect(next);
  }
  async function connect(connection: Connection) {
    if (!configured) return;
    const phone = connection.mode === "phone" ? connection.phone.replace(/\D/g, "") : undefined;
    if (phone !== undefined && !/^[1-9]\d{9,14}$/.test(phone)) {
      setModal({ ...connection, error: "Informe o código do país + DDD + número. Exemplo: 5527999999999." }); return;
    }
    if (timer.current) clearTimeout(timer.current);
    const requestId = ++generation.current;
    const current = () => alive.current && requestId === generation.current;
    setModal({ ...connection, qr: null, qrText: null, code: null, loading: true, error: null }); setBusy(true);
    let lastQrAt = 0;
    const startedAt = Date.now();
    let transientFailures = 0;
    const apply = (response: any) => {
      if (!current()) return;
      const qr = qrImageSource(response.result?.qrcode);
      const rawQr = qrCodeText(response.result?.qrCodeText);
      const code = typeof response.result?.pairingCode === "string" ? response.result.pairingCode : null;
      if (connection.mode === "phone" ? code : (qr || rawQr)) lastQrAt = Date.now();
      setModal(value => value ? { ...value, qr, qrText: rawQr, code, loading: connection.mode === "phone" ? !code : !(qr || rawQr), error: null } : null);
    };
    const poll = async () => {
      if (!current()) return;
      try {
        const status = await gatewayAction(organizationId, "status", connection.instanceName);
        if (!current()) return;
        if (["OPEN", "CONNECTED"].includes(String(status.result?.status).toUpperCase())) { close(); await refresh(); return; }
        if (Date.now() - startedAt > 180000) {
          setModal(value => value ? { ...value, qr: null, qrText: null, code: null, loading: false, error: "O tempo de conexão terminou. Gere um novo código para tentar novamente." } : null); return;
        }
        // Retrieve delayed QR and keep it fresh. Pairing codes are not regenerated once displayed.
        if (!lastQrAt || (connection.mode === "qr" && Date.now() - lastQrAt >= 25000)) {
          apply(await gatewayAction(organizationId, connection.mode === "phone" ? "pair" : "qr", connection.instanceName, phone));
        }
        transientFailures = 0;
      } catch (err) {
        if (!current()) return;
        transientFailures++;
        setModal(value => value ? { ...value, loading: false, error: err instanceof Error ? err.message : "Falha ao consultar a conexão." } : null);
        if (transientFailures >= 3) return;
      }
      if (current()) timer.current = setTimeout(() => void poll(), 4000);
    };
    try {
      const exists = accounts.some(account => account.session_id === connection.instanceName);
      const response = await gatewayAction(organizationId, exists ? (phone ? "pair" : "qr") : "create", connection.instanceName, phone);
      if (!current()) return;
      apply(response);
      // Creation can return a valid QR: preserve it, wait for status before requesting another.
      timer.current = setTimeout(() => void poll(), 3500);
    } catch (err) {
      if (current()) setModal(value => value ? { ...value, loading: false, error: err instanceof Error ? err.message : "Não foi possível conectar." } : null);
    } finally { if (current()) { setBusy(false); void refresh(); } }
  }
  async function action(account: WhatsAppAccount, actionName: "status" | "logout" | "delete") {
    if (busy) return;
    if (actionName !== "status" && !window.confirm(actionName === "delete" ? "Excluir esta sessão?" : "Desconectar este WhatsApp? Você precisará conectá-lo novamente.")) return;
    setBusy(true);
    try { await gatewayAction(organizationId, actionName, account.session_id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha na operação."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try { await configureGateway(organizationId, configUrl.trim(), configKey.trim()); setConfigKey(""); setEditing(false); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const slots = useMemo(() => {
    const result = accounts.map((account, index) => ({ account: account as WhatsAppAccount | null, id: account.session_id, label: accountLabel(account, `WhatsApp ${index + 1}`) }));
    for (let index = 1; result.length < MAX_SESSIONS; index++) {
      const id = `zapflow-${organizationId.slice(0, 8)}-${String(index).padStart(2, "0")}`;
      if (!result.some(item => item.id === id)) result.push({ account: null, id, label: `WhatsApp ${index}` });
    }
    return result;
  }, [accounts, organizationId]);

  return <div className="grid gap-5">
    <div className="page-heading"><div><span className="eyebrow">Central de conexões</span><h1>Seus WhatsApps</h1><p>Cada número tem sua própria conexão e suas conversas. Escolha QR Code ou telefone para começar.</p></div><button className="btn btn-soft" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16}/>Atualizar</button></div>
    <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">{[["Conectados", count], ["Cadastrados", accounts.length], ["Disponíveis", Math.max(0, MAX_SESSIONS - accounts.length)]].map(([label, value]) => <div key={label} className="panel p-5"><span className="text-sm text-[#718077]">{label}</span><strong className="mt-2 block text-3xl text-[#247747]">{value}</strong></div>)}</div>
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={20}/>{error}</div>}
    <div className="flex items-center justify-between rounded-xl bg-[#eef6f0] p-4 text-sm text-[#355641]"><span>{configured ? "Serviço de conexão configurado" : "Configure o serviço de conexão para adicionar números"}</span><button className="btn btn-soft" onClick={() => setEditing(!editing)}><Settings2 size={16}/>Configuração</button></div>
    {(!configured || editing) && !loading && <section className="panel grid gap-3 p-5"><h2>Configuração da Evolution API</h2><label className="grid gap-1 text-sm">Endereço do servidor<input className="rounded-xl border p-3" value={configUrl} onChange={e => setConfigUrl(e.target.value)} placeholder="https://evolution.seudominio.com"/></label><label className="grid gap-1 text-sm">Chave de acesso<input type="password" autoComplete="off" className="rounded-xl border p-3" value={configKey} onChange={e => setConfigKey(e.target.value)}/></label><button className="btn btn-primary justify-self-start" disabled={busy || !configUrl || configKey.length < 8} onClick={() => void save()}>Salvar configuração</button></section>}
    {loading ? <div role="status" className="p-8 text-center">Carregando números...</div> : <section className="grid grid-cols-2 gap-4 max-[800px]:grid-cols-1">{slots.map(({ account, id, label }) => {
      const online = account ? connected(account) : false;
      return <article key={id} className={`panel p-5 ${online ? "border-[#a9ddba]" : ""}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className={`grid h-12 w-12 place-items-center rounded-2xl ${online ? "bg-[#dff6e7] text-[#238847]" : "bg-[#f1f4f2] text-[#87978c]"}`}><Smartphone size={23}/></div><div><h2 className="font-semibold text-[#26392d]">{label}</h2><p className="mt-1 text-sm text-[#6b7b70]">{account?.phone ? `+${account.phone}` : online ? "Sincronizando telefone..." : "Nenhum número conectado"}</p></div></div><span className={`status ${online ? "status-success" : "status-neutral"}`}>{online ? "Conectado" : account ? "Desconectado" : "Disponível"}</span></div>
      <p className="my-4 text-xs text-[#809087]">{online ? "As conversas deste número ficam identificadas no chat." : "Vincule um aparelho para receber e responder mensagens."}</p>
      <div className="flex flex-wrap gap-2">{online ? <><button className="btn btn-primary" onClick={() => onOpenChat?.(id)}><MessageCircle size={16}/>Abrir conversas</button><button className="btn btn-soft" disabled={busy} onClick={() => void action(account!, "status")}><RefreshCw size={16}/>Verificar</button></> : <><button className="btn btn-primary" disabled={busy || !configured} onClick={() => open(id, label, "qr")}><QrCode size={16}/>QR Code</button><button className="btn btn-soft" disabled={busy || !configured} onClick={() => open(id, label, "phone")}><Phone size={16}/>Pelo telefone</button></>}{account && <><button className="btn btn-soft" aria-label={`Desconectar ${label}`} disabled={busy} onClick={() => void action(account, "logout")}><Unplug size={16}/></button><button className="btn btn-soft" aria-label={`Excluir ${label}`} disabled={busy} onClick={() => void action(account, "delete")}><Trash2 size={16}/></button></>}</div></article>;
    })}</section>}
    <Dialog open={!!modal} onOpenChange={value => { if (!value) close(); }}><DialogContent className="max-w-md rounded-2xl bg-white p-6"><DialogTitle>Conectar {modal?.label}</DialogTitle><DialogDescription>{modal?.mode === "phone" ? "Informe o número com código do país e confirme o código no próprio WhatsApp. Não é um código enviado por SMS." : "No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho e escaneie o QR."}</DialogDescription>
      {modal && <><div className="flex gap-2"><button className={`btn ${modal.mode === "qr" ? "btn-primary" : "btn-soft"}`} onClick={() => open(modal.instanceName, modal.label, "qr")}><QrCode size={16}/>QR Code</button><button className={`btn ${modal.mode === "phone" ? "btn-primary" : "btn-soft"}`} onClick={() => open(modal.instanceName, modal.label, "phone")}><Phone size={16}/>Telefone</button></div>
      {modal.mode === "phone" && <label className="grid gap-2 text-sm">Telefone com país e DDD<input type="tel" placeholder="55 27 99999-9999" className="rounded-xl border p-3" disabled={modal.loading || !!modal.code} value={modal.phone} onChange={e => setModal({ ...modal, phone: e.target.value })}/></label>}
      <div className="grid min-h-48 place-items-center rounded-2xl bg-[#f3f8f4] p-5" aria-live="polite">{modal.loading ? <div className="text-center"><Loader2 className="mx-auto animate-spin text-[#269451]"/><p className="mt-3 text-sm">Preparando conexão. Aguarde...</p></div> : modal.mode === "phone" && modal.code ? <div className="text-center"><strong className="font-mono text-3xl tracking-widest text-[#247747]">{modal.code}</strong><p className="mt-4 text-sm">No WhatsApp, toque em Conectar um aparelho → Conectar com número de telefone e digite este código.</p></div> : modal.mode === "qr" && modal.qr ? <img src={modal.qr} alt="QR Code de conexão do WhatsApp" className="w-64 max-w-full bg-white p-2"/> : modal.mode === "qr" && modal.qrText ? <div className="max-w-full text-center"><QrCode size={44} className="mx-auto text-[#247747]"/><p className="mt-3 text-sm font-semibold text-[#355641]">QR recebido do servidor, mas em formato de texto.</p><p className="mt-1 text-xs text-[#718077]">Atualize a Evolution para uma versão que forneça base64 do QR ou use “Pelo telefone” para conectar agora.</p></div> : <Smartphone size={40} className="text-[#89a591]"/>}</div>
      {modal.error && <p role="alert" className="text-sm text-amber-800">{modal.error}</p>}
      <p className="text-xs text-[#718077]">A confirmação aparece automaticamente. O QR é atualizado enquanto esta janela estiver aberta.</p><button className="btn btn-primary" disabled={modal.loading || busy} onClick={() => void connect(modal)}><RefreshCw size={16}/>{modal.code || modal.qr || modal.qrText ? "Gerar novo código" : "Gerar código"}</button></>}
    </DialogContent></Dialog>
  </div>;
}
