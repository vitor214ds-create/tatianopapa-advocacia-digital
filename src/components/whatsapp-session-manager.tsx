import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, Trash2, Unplug, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { accountConnected, configureGateway, gatewayAction, listWhatsAppAccounts, qrImageSource, type WhatsAppAccount } from "../lib/zapflow-api";

type Props = { organizationId: string; onAccountsChange?: (accounts: WhatsAppAccount[]) => void };
type ModalState = { instanceName: string; qr: string | null; loading: boolean; error: string | null } | null;
const MAX_SESSIONS = 10;
function normalizedState(account: WhatsAppAccount) { return String(account.connection_status || account.session_status || account.status || "DISCONNECTED").toUpperCase(); }
const isConnected = accountConnected;
function isWaiting(account: WhatsAppAccount) { const state = normalizedState(account); return state.includes("WAITING") || state.includes("CONNECTING"); }
function slotName(index: number) { return `WhatsApp ${String(index + 1).padStart(2, "0")}`; }

export function WhatsAppSessionManager({ organizationId, onAccountsChange }: Props) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [gatewayConfigured, setGatewayConfigured] = useState(false);
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState("");
  const [configUrl, setConfigUrl] = useState("");
  const [configKey, setConfigKey] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const pollRef = useRef<number | null>(null);
  const modalRequest = useRef(0);
  const mounted = useRef(true);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const connected = useMemo(() => accounts.filter(isConnected).length, [accounts]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    refreshInFlight.current = listWhatsAppAccounts(organizationId).then(response => {
      if (!mounted.current) return;
      const next = response.accounts || [];
      setAccounts(next);
      onAccountsChange?.(next);
      setGatewayConfigured(Boolean(response.gatewayConfigured));
      setGatewayBaseUrl(response.gatewayBaseUrl || "");
      setLoadError(null);
    }).catch(err => {
      if (mounted.current) setLoadError(err instanceof Error ? err.message : "Não foi possível carregar as sessões.");
    }).finally(() => {
      if (mounted.current) setLoading(false);
      refreshInFlight.current = null;
    });
    return refreshInFlight.current;
  }, [organizationId, onAccountsChange]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => {
      mounted.current = false;
      modalRequest.current += 1;
      window.clearInterval(id);
      if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    };
  }, [refresh]);

  function stopPolling() {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  function closeModal() {
    modalRequest.current += 1;
    stopPolling();
    setModal(null);
    setBusy(null);
  }

  async function saveGatewayConfig() {
    if (configBusy) return;
    setConfigBusy(true); setError(null);
    try {
      await configureGateway(organizationId, configUrl.trim(), configKey.trim());
      if (!mounted.current) return;
      setConfigKey("");
      setEditingConfig(false);
      await refresh();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Não foi possível salvar o gateway.");
    } finally { if (mounted.current) setConfigBusy(false); }
  }

  function startStatusPolling(instanceName: string, requestId: number) {
    stopPolling();
    const poll = async () => {
      if (!mounted.current || modalRequest.current !== requestId) return;
      try {
        const response = await gatewayAction(organizationId, "status", instanceName);
        if (!mounted.current || modalRequest.current !== requestId) return;
        const state = String(response?.result?.status || "").toUpperCase();
        await refresh();
        if (modalRequest.current !== requestId) return;
        if (state === "OPEN" || state === "CONNECTED") { closeModal(); return; }
      } catch (err) {
        if (mounted.current && modalRequest.current === requestId) {
          setModal(current => current ? { ...current, error: err instanceof Error ? err.message : "Não foi possível verificar a conexão." } : null);
        }
      }
      if (mounted.current && modalRequest.current === requestId) {
        pollRef.current = window.setTimeout(() => void poll(), 3500);
      }
    };
    pollRef.current = window.setTimeout(() => void poll(), 3500);
  }

  async function openQr(instanceName: string, createFirst = false) {
    if (!gatewayConfigured) { setError("Configure a Evolution API abaixo antes de conectar por QR."); return; }
    stopPolling();
    const requestId = ++modalRequest.current;
    setModal({ instanceName, qr: null, loading: true, error: null });
    setBusy(instanceName);
    setError(null);
    try {
      // Creation may already include a QR; do not invalidate it with an
      // unnecessary second connect call.
      let response = createFirst ? await gatewayAction(organizationId, "create", instanceName) : null;
      if (!mounted.current || modalRequest.current !== requestId) return;
      if (!qrImageSource(response?.result?.qrcode)) response = await gatewayAction(organizationId, "qr", instanceName);
      if (!mounted.current || modalRequest.current !== requestId) return;
      const source = qrImageSource(response?.result?.qrcode);
      setModal({ instanceName, qr: source, loading: false, error: source ? null : "O QR ainda não está disponível. Aguarde ou gere outro QR." });
      await refresh();
      if (mounted.current && modalRequest.current === requestId) startStatusPolling(instanceName, requestId);
    } catch (err) {
      if (mounted.current && modalRequest.current === requestId) {
        setModal({ instanceName, qr: null, loading: false, error: err instanceof Error ? err.message : "Falha ao gerar QR." });
        // A timed-out creation can still have reserved a session on the server.
        await refresh();
      }
    } finally {
      if (mounted.current && modalRequest.current === requestId) setBusy(null);
    }
  }

  async function runAction(account: WhatsAppAccount, action: "status" | "logout" | "delete") {
    if (busy) return;
    if (!gatewayConfigured) { setError("Configure a Evolution API antes de administrar sessões."); return; }
    const instanceName = account.session_id;
    if (action === "delete" && !window.confirm(`Excluir a sessão ${account.internal_name || instanceName}?`)) return;
    if (action === "logout" && !window.confirm(`Desconectar ${account.internal_name || instanceName}? Será necessário escanear o QR novamente.`)) return;
    setBusy(instanceName); setError(null);
    try { await gatewayAction(organizationId, action, instanceName); await refresh(); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Não foi possível concluir a ação."); }
    finally { if (mounted.current) setBusy(null); }
  }

  const accountsBySession = useMemo(
    () => new Map(accounts.map(account => [account.session_id, account])),
    [accounts],
  );
  const slots = Array.from({ length: MAX_SESSIONS }, (_, index) => {
    const sessionId = `zapflow-${organizationId.slice(0, 8)}-${String(index + 1).padStart(2, "0")}`;
    return { index, account: accountsBySession.get(sessionId) || null };
  });

  return <>
    <div className="page-heading"><div><span className="eyebrow">Sessões reais</span><h1>Números WhatsApp</h1><p>Conecte e gerencie até 10 números independentes. O QR é gerado pela Evolution API hospedada.</p></div><button className="btn btn-soft" onClick={() => { setLoading(true); void refresh(); }} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar</button></div>

    {gatewayConfigured && <div className="notice"><CheckCircle2 size={20}/><div><strong>Gateway configurado</strong><p>Conecte ou verifique uma sessão para confirmar a comunicação com o WhatsApp.</p><button className="btn btn-soft mt-3" onClick={() => { setConfigUrl(gatewayBaseUrl); setConfigKey(""); setEditingConfig(value => !value); }}>{editingConfig ? "Fechar configuração" : "Editar gateway"}</button></div></div>}
    {(!gatewayConfigured || editingConfig) && !loading && <section className="panel mb-4 p-4"><h2 className="font-semibold">Configuração do gateway</h2><p className="mt-1 text-sm text-[#718077]">Informe o endereço e a chave da sua Evolution API. A chave é armazenada com segurança e não será exibida novamente.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><label className="grid gap-2 text-sm">URL da Evolution<input className="h-11 min-w-0 rounded-xl border border-[#dfe7e1] px-3" placeholder="https://evolution.seudominio.com" value={configUrl} onChange={e=>setConfigUrl(e.target.value)}/></label><label className="grid gap-2 text-sm">API key da Evolution<input className="h-11 min-w-0 rounded-xl border border-[#dfe7e1] px-3" type="password" autoComplete="off" value={configKey} onChange={e=>setConfigKey(e.target.value)}/></label><button className="btn btn-primary self-end" disabled={configBusy || !configUrl.trim() || configKey.trim().length < 8} onClick={() => void saveGatewayConfig()}>{configBusy ? <Loader2 size={16} className="animate-spin"/> : null}Salvar gateway</button></div></section>}
    {loadError && <div role="alert" className="notice"><AlertTriangle size={18}/><p>{loadError}</p></div>}

    {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

    <section className="panel mb-4">
      <div className="panel-title"><div><span className="eyebrow">Capacidade</span><h2>{connected} de {MAX_SESSIONS} números conectados</h2></div><span className={`status ${gatewayConfigured ? (connected ? "status-success" : "status-warning") : "status-neutral"}`}>{gatewayConfigured ? (connected ? "Gateway em operação" : "Gateway pronto") : "Gateway não configurado"}</span></div>
      <div className="grid grid-cols-2 gap-4 p-4 max-[900px]:grid-cols-1">
        {slots.map(({ index, account }) => {
          const connectedNow = account ? isConnected(account) : false;
          const waiting = account ? isWaiting(account) : false;
          const instanceName = account?.session_id || `zapflow-${organizationId.slice(0, 8)}-${String(index + 1).padStart(2, "0")}`;
          const stateLabel = connectedNow ? "Conectado" : waiting ? "Aguardando conexão" : account ? "Desconectado" : "Disponível";
          const isBusy = busy === instanceName;
          const actionDisabled = Boolean(busy) || loading || !gatewayConfigured;
          return <div key={instanceName} className="rounded-2xl border border-[#e2e9e3] bg-white p-4 shadow-[0_7px_24px_rgba(21,47,28,.035)]"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf8f0] text-[#269451]"><Smartphone size={21}/></div><div><strong className="block text-sm text-[#26392d]">{account?.internal_name || slotName(index)}</strong><span className="mt-1 block text-[11px] text-[#87958c]">{account?.phone || "Nenhum telefone identificado"}</span></div></div><span className={`status ${connectedNow ? "status-success" : waiting ? "status-warning" : "status-neutral"}`}>{stateLabel}</span></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f7f9f7] p-3 text-[11px]"><div><span className="block text-[#8a988f]">Distribuição</span><strong className="mt-1 block text-[#304237]">Igualitária</strong></div><div><span className="block text-[#8a988f]">Último sinal</span><strong className="mt-1 block text-[#304237]">{account?.last_seen_at ? new Date(account.last_seen_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div></div><div className="mt-4 flex flex-wrap gap-2">{!account && <button className="btn btn-primary flex-1" onClick={() => void openQr(instanceName, true)} disabled={actionDisabled}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <QrCode size={16}/>}Conectar por QR</button>}{account && !connectedNow && <button className="btn btn-primary flex-1" onClick={() => void openQr(instanceName)} disabled={actionDisabled}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <QrCode size={16}/>}Gerar novo QR</button>}{account && connectedNow && <button className="btn btn-soft flex-1" onClick={() => void runAction(account, "status")} disabled={actionDisabled}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Verificar</button>}{account && <button className="btn btn-soft" title="Desconectar" onClick={() => void runAction(account, "logout")} disabled={actionDisabled}><Unplug size={16}/></button>}{account && <button className="btn btn-soft" title="Excluir sessão" onClick={() => void runAction(account, "delete")} disabled={actionDisabled}><Trash2 size={16}/></button>}</div></div>;
        })}
      </div>
    </section>

    <Dialog open={Boolean(modal)} onOpenChange={open => { if (!open) closeModal(); }}>
      <DialogContent className="max-w-md rounded-2xl bg-white p-5">
        <DialogTitle className="text-xl text-[#26392d]">Escaneie o QR no WhatsApp</DialogTitle>
        <DialogDescription>No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho. A janela fecha quando a conexão for confirmada.</DialogDescription>
        {modal && <>
          <div className="grid min-h-64 place-items-center rounded-2xl border border-[#e2e9e3] bg-[#f8faf8] p-5">
            {modal.loading && <div role="status" className="text-center"><Loader2 size={32} className="mx-auto animate-spin text-[#269451]"/><p className="mt-3 text-sm">Gerando QR no gateway...</p></div>}
            {!modal.loading && modal.qr && <img src={modal.qr} alt="QR Code para conectar WhatsApp" className="h-auto w-full max-w-[260px] rounded-xl bg-white p-2"/>}
            {!modal.loading && modal.error && <p role="alert" className="mt-3 text-center text-sm text-amber-800">{modal.error}</p>}
          </div>
          <p className="text-xs text-[#718077]">Se o QR expirar, gere outro abaixo.</p>
          <div className="flex justify-end gap-2"><button className="btn btn-soft" onClick={closeModal}><X size={16}/>Fechar</button><button className="btn btn-primary" disabled={modal.loading} onClick={() => void openQr(modal.instanceName, !accounts.some(account => account.session_id === modal.instanceName))}><RefreshCw size={16}/>Gerar outro QR</button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
