import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MoreHorizontal, QrCode, RefreshCw, Smartphone, Trash2, Unplug, X } from "lucide-react";
import { gatewayAction, listWhatsAppAccounts, qrImageSource, type WhatsAppAccount } from "../lib/zapflow-api";

type Props = {
  organizationId: string;
  onConnectedCountChange?: (count: number) => void;
};

type ModalState = {
  instanceName: string;
  qr: string | null;
  loading: boolean;
  error: string | null;
} | null;

const MAX_SESSIONS = 10;

function normalizedState(account: WhatsAppAccount) {
  return String(account.connection_status || account.session_status || account.status || "DISCONNECTED").toUpperCase();
}

function isConnected(account: WhatsAppAccount) {
  const state = normalizedState(account);
  return state.includes("CONNECTED") || state === "OPEN";
}

function isWaiting(account: WhatsAppAccount) {
  const state = normalizedState(account);
  return state.includes("WAITING") || state.includes("CONNECTING");
}

function slotName(index: number) {
  return `WhatsApp ${String(index + 1).padStart(2, "0")}`;
}

export function WhatsAppSessionManager({ organizationId, onConnectedCountChange }: Props) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const pollRef = useRef<number | null>(null);

  const connected = useMemo(() => accounts.filter(isConnected).length, [accounts]);

  useEffect(() => {
    onConnectedCountChange?.(connected);
  }, [connected, onConnectedCountChange]);

  async function refresh() {
    try {
      const response = await listWhatsAppAccounts(organizationId);
      setAccounts(response.accounts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as sessões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [organizationId]);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  async function openQr(instanceName: string, createFirst = false) {
    setModal({ instanceName, qr: null, loading: true, error: null });
    setBusy(instanceName);
    try {
      if (createFirst) await gatewayAction(organizationId, "create", instanceName);
      const qrResponse = await gatewayAction(organizationId, "qr", instanceName);
      const source = qrImageSource(qrResponse?.result?.qrcode);
      setModal({ instanceName, qr: source, loading: false, error: source ? null : "O gateway respondeu, mas não retornou uma imagem de QR válida." });
      await refresh();
      startStatusPolling(instanceName);
    } catch (err) {
      setModal({ instanceName, qr: null, loading: false, error: err instanceof Error ? err.message : "Falha ao gerar QR." });
    } finally {
      setBusy(null);
    }
  }

  function startStatusPolling(instanceName: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await gatewayAction(organizationId, "status", instanceName);
        const state = String(response?.result?.status || "").toUpperCase();
        await refresh();
        if (state.includes("OPEN") || state.includes("CONNECTED")) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setModal(null);
        }
      } catch {
        // A listagem periódica continua servindo como fallback caso uma consulta pontual falhe.
      }
    }, 3500);
  }

  function closeModal() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setModal(null);
  }

  async function runAction(account: WhatsAppAccount, action: "status" | "logout" | "delete") {
    const instanceName = account.session_id;
    if (action === "delete" && !window.confirm(`Excluir a sessão ${account.internal_name || instanceName}?`)) return;
    setBusy(instanceName);
    setError(null);
    try {
      await gatewayAction(organizationId, action, instanceName);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  }

  const slots = Array.from({ length: MAX_SESSIONS }, (_, index) => ({ index, account: accounts[index] || null }));

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">Sessões reais</span><h1>Números WhatsApp</h1><p>Conecte e gerencie até 10 números independentes. O QR é gerado pelo gateway no servidor e nunca é simulado no navegador.</p></div>
      <button className="btn btn-soft" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar</button>
    </div>

    <div className="notice"><CheckCircle2 size={20}/><div><strong>Gateway protegido</strong><p>Chaves da Evolution ficam somente no backend. O navegador usa a sessão autenticada do ZapFlow para solicitar QR e administrar as conexões.</p></div></div>

    {error && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

    <section className="panel mb-4">
      <div className="panel-title"><div><span className="eyebrow">Capacidade</span><h2>{connected} de {MAX_SESSIONS} números conectados</h2></div><span className={`status ${connected ? "status-success" : "status-warning"}`}>{connected ? "Gateway em operação" : "Nenhuma sessão conectada"}</span></div>
      <div className="grid grid-cols-2 gap-4 p-4 max-[900px]:grid-cols-1">
        {slots.map(({ index, account }) => {
          const connectedNow = account ? isConnected(account) : false;
          const waiting = account ? isWaiting(account) : false;
          const instanceName = account?.session_id || `zapflow-${organizationId.slice(0, 8)}-${String(index + 1).padStart(2, "0")}`;
          const stateLabel = connectedNow ? "Conectado" : waiting ? "Aguardando conexão" : account ? "Desconectado" : "Disponível";
          const weight = account?.distribution_weight ?? account?.weight ?? 100;
          const isBusy = busy === instanceName;
          return <div key={instanceName} className="rounded-2xl border border-[#e2e9e3] bg-white p-4 shadow-[0_7px_24px_rgba(21,47,28,.035)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf8f0] text-[#269451]"><Smartphone size={21}/></div><div><strong className="block text-sm text-[#26392d]">{account?.internal_name || slotName(index)}</strong><span className="mt-1 block text-[11px] text-[#87958c]">{account?.phone || "Nenhum telefone identificado"}</span></div></div>
              <span className={`status ${connectedNow ? "status-success" : waiting ? "status-warning" : "status-neutral"}`}>{stateLabel}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f7f9f7] p-3 text-[11px]"><div><span className="block text-[#8a988f]">Peso</span><strong className="mt-1 block text-[#304237]">{weight}</strong></div><div><span className="block text-[#8a988f]">Último sinal</span><strong className="mt-1 block text-[#304237]">{account?.last_seen_at ? new Date(account.last_seen_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!account && <button className="btn btn-primary flex-1" onClick={() => void openQr(instanceName, true)} disabled={isBusy}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <QrCode size={16}/>}Conectar por QR</button>}
              {account && !connectedNow && <button className="btn btn-primary flex-1" onClick={() => void openQr(instanceName)} disabled={isBusy}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <QrCode size={16}/>}Gerar novo QR</button>}
              {account && connectedNow && <button className="btn btn-soft flex-1" onClick={() => void runAction(account, "status")} disabled={isBusy}>{isBusy ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Verificar</button>}
              {account && <button className="btn btn-soft" title="Desconectar" onClick={() => void runAction(account, "logout")} disabled={isBusy}><Unplug size={16}/></button>}
              {account && <button className="btn btn-soft" title="Excluir sessão" onClick={() => void runAction(account, "delete")} disabled={isBusy}><Trash2 size={16}/></button>}
              {!account && <button className="btn btn-soft" disabled aria-label="Mais opções"><MoreHorizontal size={16}/></button>}
            </div>
          </div>;
        })}
      </div>
    </section>

    {modal && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><span className="eyebrow">Conectar sessão</span><h2 className="mt-1 text-xl font-semibold text-[#26392d]">Escaneie o QR no WhatsApp</h2></div><button className="btn btn-soft" onClick={closeModal} aria-label="Fechar"><X size={16}/></button></div>
        <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-[#e2e9e3] bg-[#f8faf8] p-5">
          {modal.loading && <div className="text-center"><Loader2 size={32} className="mx-auto animate-spin text-[#269451]"/><p className="mt-3 text-sm text-[#66756b]">Gerando QR no gateway...</p></div>}
          {!modal.loading && modal.qr && <img src={modal.qr} alt="QR Code para conectar WhatsApp" className="h-auto w-full max-w-[260px] rounded-xl bg-white p-2"/>}
          {!modal.loading && modal.error && <div className="text-center text-sm text-amber-800"><AlertTriangle size={30} className="mx-auto mb-3"/><p>{modal.error}</p><button className="btn btn-primary mt-4" onClick={() => void openQr(modal.instanceName)}>Tentar novamente</button></div>}
        </div>
        <p className="mt-4 text-xs leading-5 text-[#718077]">No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho. Esta janela fecha automaticamente quando o gateway confirmar a conexão.</p>
      </div>
    </div>}
  </>;
}
