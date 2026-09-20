import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, BarChart3, Bell, CalendarClock, CheckCircle2, ChevronDown,
  CircleHelp, ContactRound, FileText, Gauge, Inbox, Layers3, ListFilter, Menu,
  MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Send, Settings, ShieldCheck,
  Smartphone, Sparkles, Users, WalletCards, Webhook, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WhatsAppSessionManager } from "../components/whatsapp-session-manager";
import { TemplatesPage } from "../components/templates-page";
import { createCampaign, getAuthState, listCampaigns, listWhatsAppAccounts, logout, type Campaign, type WhatsAppAccount } from "../lib/zapflow-api";

export const Route = createFileRoute("/")({ component: ZapFlowApp });

type Section = "Dashboard" | "Campanhas" | "Contatos" | "Listas" | "Conversas" | "Templates" | "WhatsApp" | "Agendamentos" | "Relatórios" | "Logs" | "Equipe" | "Assinatura" | "Configurações";

const primaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Dashboard", icon: Gauge }, { label: "Campanhas", icon: Send }, { label: "Contatos", icon: ContactRound },
  { label: "Listas", icon: Layers3 }, { label: "Conversas", icon: Inbox }, { label: "Templates", icon: FileText },
  { label: "WhatsApp", icon: MessageCircle }, { label: "Agendamentos", icon: CalendarClock }, { label: "Relatórios", icon: BarChart3 }, { label: "Logs", icon: Activity },
];
const secondaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Equipe", icon: Users }, { label: "Assinatura", icon: WalletCards }, { label: "Configurações", icon: Settings },
];

function Logo() { return <div className="brand"><div className="brand-mark"><Zap size={20} strokeWidth={2.6}/></div><div><strong>ZapFlow</strong><span>Multi-session WhatsApp</span></div></div>; }
function StatusPill({ children, tone="neutral" }: { children: React.ReactNode; tone?: "neutral"|"warning"|"success" }) { return <span className={`status status-${tone}`}>{children}</span>; }
function Metric({ label,value,helper,icon:Icon }: { label:string;value:string;helper:string;icon:typeof Gauge }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={18}/></div></div><strong>{value}</strong><small>{helper}</small></div>; }
function EmptyState({ icon:Icon,title,description,action }: { icon:typeof Gauge;title:string;description:string;action?:string }) { return <div className="empty-state"><div className="empty-icon"><Icon size={23}/></div><h3>{title}</h3><p>{description}</p>{action&&<button className="btn btn-primary"><Plus size={16}/>{action}</button>}</div>; }
function accountConnected(account: WhatsAppAccount) { const s=String(account.connection_status||account.session_status||account.status||"").toUpperCase(); return s==="CONNECTED"||s==="OPEN"; }

function Dashboard({ connected,onOpenWhatsApp,onOpenCampaigns }: { connected:number;onOpenWhatsApp:()=>void;onOpenCampaigns:()=>void }) {
  return <><div className="page-heading"><div><span className="eyebrow">Visão geral</span><h1>Central de operações</h1><p>Controle sessões, campanhas, filas e respostas de todos os números em um único painel.</p></div><button className="btn btn-primary" onClick={onOpenCampaigns}><Plus size={17}/>Nova campanha</button></div>
    <div className="metrics-grid"><Metric label="Números conectados" value={`${connected}/10`} helper="Sessões reais confirmadas" icon={Smartphone}/><Metric label="Enviadas hoje" value="—" helper="Métrica diária em preparação" icon={Send}/><Metric label="Respostas" value="—" helper="Inbox em preparação" icon={MessageCircle}/><Metric label="Falhas" value="—" helper="Métrica agregada em preparação" icon={AlertTriangle}/></div>
    <div className="dashboard-grid"><section className="panel panel-main"><div className="panel-title"><div><span className="eyebrow">Primeiros passos</span><h2>Prepare sua operação</h2></div><StatusPill tone={connected?"success":"warning"}>{connected?"Gateway ativo":"Configuração em andamento"}</StatusPill></div><div className="setup-list">
      <div className="setup-row"><div className="setup-index done"><CheckCircle2 size={17}/></div><div><strong>Autenticação e isolamento</strong><span>Sessão protegida, organizações e permissões Owner/Admin ativas.</span></div><StatusPill tone="success">Pronto</StatusPill></div>
      <div className="setup-row"><div className={`setup-index ${connected?"done":""}`}>{connected?<CheckCircle2 size={17}/>:2}</div><div><strong>Gateway Evolution/Baileys</strong><span>QR, status, logout e exclusão são executados somente pelo backend autenticado.</span></div><StatusPill tone={connected?"success":"warning"}>{connected?"Conectado":"Aguardando sessão"}</StatusPill></div>
      <div className="setup-row"><div className="setup-index">3</div><div><strong>Conectar até 10 números</strong><span>Cada número possui sessão independente e pode ser gerenciado pelo painel.</span></div><button className="btn btn-soft" onClick={onOpenWhatsApp}>Abrir WhatsApp</button></div>
      <div className="setup-row"><div className="setup-index done"><CheckCircle2 size={17}/></div><div><strong>Fila persistente e balanceada</strong><span>Jobs são divididos igualmente entre todas as sessões conectadas, com consentimento, deduplicação, pacing e retry controlado.</span></div><StatusPill tone="success">Ativa</StatusPill></div>
    </div></section><section className="panel health-card"><div className="panel-title"><div><span className="eyebrow">Sessões</span><h2>Saúde do gateway</h2></div><Webhook size={19}/></div><div className="health-score"><div className="score-ring"><span>{connected}</span></div><div><strong>{connected?"Sessões confirmadas pelo gateway":"Nenhuma sessão conectada"}</strong><p>Somente sessões realmente conectadas participam da distribuição.</p></div></div><div className="health-lines"><span><i className="dot ok"/>Autenticação Supabase</span><span><i className={connected?"dot ok":"dot wait"}/>Gateway de sessões</span><span><i className="dot ok"/>Distribuição balanceada</span></div></section></div>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">Campanhas</span><h2>Proteções operacionais</h2></div></div><div className="p-4 text-sm leading-6 text-[#526158]">Contatos sem consentimento, suprimidos, inválidos ou duplicados são rejeitados antes da fila. O envio direto foi desativado para que campanhas reais sempre passem pelo processamento persistente e espaçado.</div></section></>;
}

function CampaignsPage({ accounts, organizationId }: { accounts:WhatsAppAccount[]; organizationId:string }) {
  const active=accounts.filter(accountConnected);
  const [previewTotal,setPreviewTotal]=useState(103);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState("");
  const [message,setMessage]=useState("");
  const [recipientText,setRecipientText]=useState("");
  const [consentConfirmed,setConsentConfirmed]=useState(false);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const safeTotal=Math.max(0,Math.min(Number.isFinite(previewTotal)?previewTotal:0,5000));
  const allocation=active.length?active.map((account,index)=>({account,jobs:Math.floor(safeTotal/active.length)+(index<safeTotal%active.length?1:0)})):[];
  const values=allocation.map(item=>item.jobs);
  const difference=values.length?Math.max(...values)-Math.min(...values):0;

  async function refreshCampaigns(){
    try {
      const response=await listCampaigns(organizationId);
      setCampaigns(response.campaigns||[]);
    } catch (err) {
      setError(err instanceof Error?err.message:"Não foi possível carregar campanhas.");
    }
  }

  useEffect(()=>{void refreshCampaigns();},[organizationId]);

  function parseRecipients(){
    return recipientText
      .split(/\r?\n/)
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>{
        const parts=line.split(/[;,|\t]/).map(part=>part.trim()).filter(Boolean);
        if(parts.length>=2) return {name:parts[0],phone:parts[parts.length-1],consent:consentConfirmed};
        return {phone:line,consent:consentConfirmed};
      });
  }

  async function submitCampaign(){
    setError(null); setSuccess(null);
    if(!active.length){setError("Conecte pelo menos um número antes de criar uma campanha.");return;}
    if(name.trim().length<2){setError("Informe um nome para a campanha.");return;}
    if(!message.trim()){setError("Escreva a mensagem da campanha.");return;}
    if(!recipientText.trim()){setError("Cole pelo menos um destinatário.");return;}
    if(!consentConfirmed){setError("Confirme que os destinatários autorizaram o recebimento das mensagens.");return;}
    const recipients=parseRecipients();
    if(!recipients.length){setError("Nenhum destinatário válido informado.");return;}
    setSaving(true);
    try{
      const result=await createCampaign({organizationId,name:name.trim(),message:message.trim(),recipients});
      setSuccess(`Campanha criada: ${result.eligible} destinatários elegíveis, ${result.rejected} rejeitados, distribuídos entre ${result.sessions} sessão(ões).`);
      setCreating(false); setName(""); setMessage(""); setRecipientText(""); setConsentConfirmed(false);
      await refreshCampaigns();
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível criar a campanha.");}
    finally{setSaving(false);}
  }

  return <><div className="page-heading"><div><span className="eyebrow">Operação</span><h1>Campanhas</h1><p>Campanhas reais são persistidas, deduplicadas e divididas igualmente entre todas as sessões conectadas.</p></div><button className="btn btn-primary" onClick={()=>setCreating(true)}><Plus size={17}/>Nova campanha</button></div>
    {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {success&&<div className="notice"><CheckCircle2 size={20}/><div><strong>Campanha adicionada à fila</strong><p>{success}</p></div></div>}

    {creating&&<section className="panel mb-4">
      <div className="panel-title"><div><span className="eyebrow">Nova campanha</span><h2>Criar campanha</h2></div><button className="btn btn-soft" onClick={()=>setCreating(false)}><X size={16}/>Cancelar</button></div>
      <div className="grid gap-4 p-4">
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Nome<input className="h-11 rounded-xl border border-[#dfe7e1] px-3 outline-none focus:border-[#269451]" maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Retorno clientes setembro"/></label>
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Mensagem<textarea className="min-h-32 rounded-xl border border-[#dfe7e1] p-3 outline-none focus:border-[#269451]" maxLength={4000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Olá, tudo bem?"/></label>
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Destinatários <span className="text-[11px] font-normal text-[#829087]">Um por linha. Aceita telefone ou Nome;telefone.</span><textarea className="min-h-40 rounded-xl border border-[#dfe7e1] p-3 font-mono text-xs outline-none focus:border-[#269451]" value={recipientText} onChange={e=>setRecipientText(e.target.value)} placeholder={"27999999999\nMaria;27988888888"}/></label>
        <label className="flex items-start gap-3 rounded-xl border border-[#dfe7e1] bg-[#f8faf8] p-3 text-sm text-[#526158]"><input type="checkbox" className="mt-1" checked={consentConfirmed} onChange={e=>setConsentConfirmed(e.target.checked)}/><span>Confirmo que estes destinatários autorizaram o recebimento destas mensagens e que contatos com opt-out não foram incluídos.</span></label>
        <div className="flex justify-end"><button className="btn btn-primary" disabled={saving} onClick={()=>void submitCampaign()}>{saving?"Criando...":"Criar e enfileirar campanha"}</button></div>
      </div>
    </section>}

    <section className="panel mb-4"><div className="panel-title"><div><span className="eyebrow">Distribuidor equilibrado</span><h2>Prévia da divisão</h2></div><StatusPill tone={active.length?"success":"warning"}>{active.length} sessões ativas</StatusPill></div><div className="flex flex-wrap items-end gap-3 border-b border-[#edf1ee] p-4"><label className="grid gap-1 text-xs font-semibold text-[#66756b]">Quantidade de destinatários<input type="number" min={0} max={5000} value={previewTotal} onChange={e=>setPreviewTotal(Math.max(0,Math.min(5000,Number(e.target.value)||0)))} className="h-10 w-44 rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none"/></label><div className="text-xs text-[#718077]">Diferença máxima entre números: <strong>{difference}</strong> mensagem. A fila real usa o mesmo round-robin.</div></div>{active.length?<div className="grid grid-cols-2 gap-3 p-4 max-[700px]:grid-cols-1">{allocation.map(({account,jobs})=><div key={account.id} className="flex items-center justify-between rounded-xl border border-[#e5ebe6] p-4"><div><strong className="block text-sm text-[#2a3c30]">{account.internal_name||account.session_id}</strong><span className="mt-1 block text-[11px] text-[#87958c]">{account.phone||"Telefone conectado"}</span></div><strong className="text-lg text-[#159447]">{jobs} jobs</strong></div>)}</div>:<EmptyState icon={Smartphone} title="Nenhuma sessão ativa" description="Conecte pelo menos um número real antes de criar a distribuição da campanha."/>}</section>

    <section className="panel mb-4"><div className="panel-title"><div><span className="eyebrow">Fila persistente</span><h2>Campanhas recentes</h2></div><button className="btn btn-soft" onClick={()=>void refreshCampaigns()}><RefreshCw size={15}/>Atualizar</button></div>{campaigns.length?<div className="grid gap-2 p-4">{campaigns.slice(0,20).map(campaign=><div key={campaign.id} className="grid gap-2 rounded-xl border border-[#e5ebe6] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><strong className="block text-sm text-[#2a3c30]">{campaign.name}</strong><span className="text-[11px] text-[#87958c]">{campaign.eligible_recipients} elegíveis • {campaign.rejected_recipients} rejeitados</span></div><StatusPill tone={campaign.status==="COMPLETED"?"success":campaign.status==="FAILED"?"warning":"neutral"}>{campaign.status}</StatusPill><span className="text-xs text-[#526158]">{campaign.sent_count} enviadas • {campaign.failed_count} falhas • {campaign.canceled_count || 0} canceladas</span></div>)}</div>:<div className="empty-state"><div className="empty-icon"><Send size={23}/></div><h3>Nenhuma campanha criada</h3><p>Crie a primeira campanha usando somente contatos que autorizaram o recebimento.</p></div>}</section>
    <section className="panel"><div className="p-4 text-sm leading-6 text-[#526158]"><strong className="text-[#304237]">Controles ativos:</strong> consentimento obrigatório, supressão respeitada, telefone normalizado, deduplicação por número, distribuição igualitária, fila persistente e retry com backoff. O worker é acionado automaticamente pelo Supabase.</div></section></>;
}

function ContactsPage(){return <><div className="page-heading"><div><span className="eyebrow">Base de contatos</span><h1>Contatos</h1><p>O cadastro permanente de contatos ainda não está ativado. Para campanhas, use a lista colada no formulário e confirme o consentimento.</p></div><StatusPill tone="warning">Em preparação</StatusPill></div><section className="panel"><EmptyState icon={ContactRound} title="Módulo de contatos em preparação" description="Nenhum botão falso: quando importação e cadastro permanente forem ativados, esta área passará a usar dados reais do workspace."/></section></>}

function GenericPage({section}:{section:Exclude<Section,"Dashboard"|"Campanhas"|"Contatos"|"Templates"|"WhatsApp">}){const map:Record<typeof section,[typeof Gauge,string,string]>={Listas:[Layers3,"Listas de contatos","Segmentação permanente ainda não ativada."],Conversas:[Inbox,"Inbox","A leitura centralizada de respostas ainda não está ativada."],Agendamentos:[CalendarClock,"Agendamentos","Agendamento avançado ainda não está ativado."],Relatórios:[BarChart3,"Relatórios","Relatórios avançados ainda não estão ativados."],Logs:[Activity,"Logs operacionais","A visualização completa de logs ainda não está ativada."],Equipe:[Users,"Equipe","Gestão de múltiplos membros ainda não está ativada."],Assinatura:[WalletCards,"Assinatura","Gestão de planos ainda não está ativada."],Configurações:[Settings,"Configurações","Configurações avançadas ainda não estão ativadas."]};const[Icon,title,description]=map[section];return <><div className="page-heading"><div><span className="eyebrow">ZapFlow</span><h1>{title}</h1><p>{description}</p></div><StatusPill tone="warning">Em preparação</StatusPill></div><section className="panel"><EmptyState icon={Icon} title="Módulo em preparação" description="Esta área foi mantida no menu para a evolução do produto, mas não exibe mais botões sem função."/></section></>}
function ZapFlowApp(){
  const navigateRouter=useNavigate(); const[section,setSection]=useState<Section>("Dashboard"); const[mobileOpen,setMobileOpen]=useState(false); const[organizationId,setOrganizationId]=useState<string|null>(null); const[email,setEmail]=useState<string|null>(null); const[role,setRole]=useState("OWNER"); const[accounts,setAccounts]=useState<WhatsAppAccount[]>([]); const[loadingAuth,setLoadingAuth]=useState(true); const title=useMemo(()=>section,[section]); const connected=accounts.filter(accountConnected).length;
  useEffect(()=>{getAuthState().then(async auth=>{if(!auth.activeOrganizationId){navigateRouter({to:"/login"});return;}setOrganizationId(auth.activeOrganizationId);setEmail(auth.user.email);setRole(auth.memberships.find(m=>m.organization_id===auth.activeOrganizationId)?.role||"MEMBER");try{const response=await listWhatsAppAccounts(auth.activeOrganizationId);setAccounts(response.accounts||[]);}catch{}setLoadingAuth(false);}).catch(()=>navigateRouter({to:"/login"}));},[navigateRouter]);
  async function refreshAccounts(){if(!organizationId)return;try{const response=await listWhatsAppAccounts(organizationId);setAccounts(response.accounts||[]);}catch{}}
  async function signOut(){await logout().catch(()=>undefined);navigateRouter({to:"/login"});}
  const navigate=(label:Section)=>{setSection(label);setMobileOpen(false);if(label!=="WhatsApp")void refreshAccounts();};
  if(loadingAuth)return <main className="grid min-h-screen place-items-center bg-[#f4f7f4] text-[#526158]"><div className="text-center"><Zap size={30} className="mx-auto mb-3 text-[#269451]"/><strong>Carregando ZapFlow...</strong></div></main>;
  if(!organizationId)return null;
  const initials=(email||"ZF").split("@")[0].slice(0,2).toUpperCase();
  const genericSection = !(["Dashboard","Campanhas","Contatos","Templates","WhatsApp"] as Section[]).includes(section) ? section as Exclude<Section,"Dashboard"|"Campanhas"|"Contatos"|"Templates"|"WhatsApp"> : null;
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen?"open":""}`}><div className="sidebar-top"><Logo/><button className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={20}/></button></div><div className="workspace-switch"><div className="workspace-avatar">Z</div><div><span>Workspace</span><strong>ZapFlow</strong></div><ChevronDown size={16}/></div><nav>{primaryNav.map(({label,icon:Icon})=><button key={label} className={section===label?"active":""} onClick={()=>navigate(label)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="nav-divider"/><nav>{secondaryNav.map(({label,icon:Icon})=><button key={label} className={section===label?"active":""} onClick={()=>navigate(label)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="help-card"><Sparkles size={18}/><strong>Sessões WhatsApp</strong><span>{connected?`${connected} número(s) conectado(s) ao gateway.`:"Conecte o primeiro número por QR."}</span><button onClick={()=>navigate("WhatsApp")}>Gerenciar sessões</button></div><button className="account-row" onClick={()=>void signOut()} title="Sair"><div className="avatar">{initials}</div><div><strong>{email||"Minha conta"}</strong><span>{role} • clique para sair</span></div><MoreHorizontal size={17}/></button></div></aside>{mobileOpen&&<button className="scrim" onClick={()=>setMobileOpen(false)} aria-label="Fechar menu"/>}<main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div><span>ZapFlow</span><strong>{title}</strong></div></div><div className="topbar-actions"><div className="global-search" title="Busca global em preparação"><Search size={16}/><span>Busca em preparação</span></div><button className="icon-btn" disabled title="Ajuda em preparação"><CircleHelp size={19}/></button><button className="icon-btn notification" disabled title="Notificações em preparação"><Bell size={19}/></button><button className="profile-btn" onClick={()=>void signOut()} title="Sair">{initials}</button></div></header><div className="content-wrap">{section==="Dashboard"&&<Dashboard connected={connected} onOpenWhatsApp={()=>navigate("WhatsApp")} onOpenCampaigns={()=>navigate("Campanhas")}/>} {section==="Campanhas"&&<CampaignsPage accounts={accounts} organizationId={organizationId}/>} {section==="Contatos"&&<ContactsPage/>} {section==="Templates"&&<TemplatesPage organizationId={organizationId}/>} {section==="WhatsApp"&&<WhatsAppSessionManager organizationId={organizationId} onConnectedCountChange={()=>void refreshAccounts()}/>} {genericSection&&<GenericPage section={genericSection}/>}<footer className="app-footer"><span><ShieldCheck size={12}/>ZapFlow • backend multi-tenant</span><span>10 sessões por organização</span></footer></div></main></div>;
}
