import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, BarChart3, Bell, CalendarClock, CheckCircle2, ChevronDown,
  CircleHelp, ContactRound, FileText, Gauge, Inbox, Layers3, ListFilter, Menu,
  MessageCircle, MoreHorizontal, Plus, QrCode, Search, Send, Settings, ShieldCheck,
  SlidersHorizontal, Smartphone, Sparkles, Users, WalletCards, Webhook, X, Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({ component: ZapFlowApp });

type Section = "Dashboard" | "Campanhas" | "Contatos" | "Listas" | "Conversas" | "Templates" | "WhatsApp" | "Agendamentos" | "Relatórios" | "Logs" | "Equipe" | "Assinatura" | "Configurações";
type SlotStatus = "available" | "waiting" | "connected" | "attention";
type Slot = { id: number; name: string; phone?: string; status: SlotStatus; weight: number };

const initialSlots: Slot[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `WhatsApp ${String(i + 1).padStart(2, "0")}`, status: "available", weight: 100 }));

const primaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Dashboard", icon: Gauge }, { label: "Campanhas", icon: Send }, { label: "Contatos", icon: ContactRound },
  { label: "Listas", icon: Layers3 }, { label: "Conversas", icon: Inbox }, { label: "Templates", icon: FileText },
  { label: "WhatsApp", icon: MessageCircle }, { label: "Agendamentos", icon: CalendarClock }, { label: "Relatórios", icon: BarChart3 }, { label: "Logs", icon: Activity },
];
const secondaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Equipe", icon: Users }, { label: "Assinatura", icon: WalletCards }, { label: "Configurações", icon: Settings },
];

function Logo() {
  return <div className="brand"><div className="brand-mark"><Zap size={20} strokeWidth={2.6} /></div><div><strong>ZapFlow</strong><span>Multi-session WhatsApp</span></div></div>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "success" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function Metric({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Gauge }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={18} /></div></div><strong>{value}</strong><small>{helper}</small></div>;
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Gauge; title: string; description: string; action?: string }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={23} /></div><h3>{title}</h3><p>{description}</p>{action && <button className="btn btn-primary"><Plus size={16} />{action}</button>}</div>;
}

function Dashboard({ connected }: { connected: number }) {
  return <>
    <div className="page-heading"><div><span className="eyebrow">Visão geral</span><h1>Central de operações</h1><p>Controle sessões, campanhas, filas e respostas de todos os números em um único painel.</p></div><button className="btn btn-primary"><Plus size={17} />Nova campanha</button></div>
    <div className="metrics-grid">
      <Metric label="Números conectados" value={`${connected}/10`} helper="Sessões simultâneas" icon={Smartphone} />
      <Metric label="Enviadas hoje" value="0" helper="Aguardando primeira campanha" icon={Send} />
      <Metric label="Respostas" value="0" helper="Inbox ainda sem conversas" icon={MessageCircle} />
      <Metric label="Falhas" value="0" helper="Nenhuma falha registrada" icon={AlertTriangle} />
    </div>
    <div className="dashboard-grid">
      <section className="panel panel-main"><div className="panel-title"><div><span className="eyebrow">Primeiros passos</span><h2>Prepare sua operação</h2></div><StatusPill tone="warning">Configuração em andamento</StatusPill></div>
        <div className="setup-list">
          <div className="setup-row"><div className="setup-index done"><CheckCircle2 size={17}/></div><div><strong>Banco multi-tenant</strong><span>Filas, sessões, consentimento, campanhas e isolamento por organização preparados.</span></div><StatusPill tone="success">Pronto</StatusPill></div>
          <div className="setup-row"><div className="setup-index">2</div><div><strong>Escolher provedor de sessão</strong><span>Necessário para gerar QR real, manter as 10 sessões vivas e enviar mensagens sem depender do navegador.</span></div><StatusPill tone="warning">Pendente</StatusPill></div>
          <div className="setup-row"><div className="setup-index">3</div><div><strong>Conectar até 10 números</strong><span>Cada número terá sessão, heartbeat, fila e métricas independentes.</span></div><button className="btn btn-soft">Abrir WhatsApp</button></div>
          <div className="setup-row"><div className="setup-index">4</div><div><strong>Importar contatos consentidos</strong><span>TXT, CSV ou XLSX com validação e supressão antes da campanha.</span></div><button className="btn btn-soft">Importar</button></div>
        </div>
      </section>
      <section className="panel health-card"><div className="panel-title"><div><span className="eyebrow">Sessões</span><h2>Saúde do gateway</h2></div><Webhook size={19}/></div>
        <div className="health-score"><div className="score-ring"><span>{connected}</span></div><div><strong>{connected ? "Sessões ativas" : "Gateway ainda não conectado"}</strong><p>O painel só marcará uma sessão como conectada depois que um provedor real confirmar o vínculo.</p></div></div>
        <div className="health-lines"><span><i className="dot ok"/>Supabase ativo</span><span><i className="dot wait"/>Provedor de sessão pendente</span><span><i className="dot wait"/>Workers de envio pendentes</span></div>
      </section>
    </div>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">Campanhas</span><h2>Atividade recente</h2></div></div><EmptyState icon={Send} title="Nenhuma campanha criada" description="Assim que uma campanha for criada, o distribuidor dividirá os jobs apenas entre sessões ativas e autorizadas." action="Criar primeira campanha" /></section>
  </>;
}

function SessionSlot({ slot, onConnect }: { slot: Slot; onConnect: (id: number) => void }) {
  const tone = slot.status === "connected" ? "success" : slot.status === "waiting" || slot.status === "attention" ? "warning" : "neutral";
  const label = slot.status === "connected" ? "Conectado" : slot.status === "waiting" ? "Aguardando QR" : slot.status === "attention" ? "Atenção" : "Disponível";
  return <div className="rounded-2xl border border-[#e2e9e3] bg-white p-4 shadow-[0_7px_24px_rgba(21,47,28,.035)]">
    <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf8f0] text-[#269451]"><Smartphone size={21}/></div><div><strong className="block text-sm text-[#26392d]">{slot.name}</strong><span className="mt-1 block text-[11px] text-[#87958c]">{slot.phone || "Nenhum telefone vinculado"}</span></div></div><StatusPill tone={tone}>{label}</StatusPill></div>
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f7f9f7] p-3 text-[11px]"><div><span className="block text-[#8a988f]">Peso</span><strong className="mt-1 block text-[#304237]">{slot.weight}</strong></div><div><span className="block text-[#8a988f]">Fila</span><strong className="mt-1 block text-[#304237]">0 jobs</strong></div></div>
    <div className="mt-4 flex gap-2">{slot.status === "available" ? <button className="btn btn-primary flex-1" onClick={() => onConnect(slot.id)}><QrCode size={16}/>Conectar por QR</button> : <button className="btn btn-soft flex-1"><SlidersHorizontal size={16}/>Gerenciar</button>}<button className="btn btn-soft" aria-label="Mais opções"><MoreHorizontal size={16}/></button></div>
  </div>;
}

function WhatsAppPage({ slots, setSlots }: { slots: Slot[]; setSlots: React.Dispatch<React.SetStateAction<Slot[]>> }) {
  const connected = slots.filter(s => s.status === "connected").length;
  const connect = (id: number) => setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: "waiting" } : slot));
  return <>
    <div className="page-heading"><div><span className="eyebrow">Sessões</span><h1>Números WhatsApp</h1><p>Conecte e gerencie até 10 sessões independentes dentro da mesma organização.</p></div><button className="btn btn-primary" disabled={connected >= 10}><Plus size={17}/>Adicionar sessão</button></div>
    <div className="notice"><ShieldCheck size={20}/><div><strong>Modelo de conexão por sessão</strong><p>O ZapFlow está preparado para um gateway de sessão/QR. O QR real, heartbeat, reconexão e envio precisam vir de um serviço de sessão executando no backend. O sistema não exibirá QR falso.</p></div></div>
    <section className="panel mb-4"><div className="panel-title"><div><span className="eyebrow">Capacidade</span><h2>{connected} de 10 números conectados</h2></div><StatusPill tone={connected ? "success" : "warning"}>{connected ? "Operação parcial" : "Gateway pendente"}</StatusPill></div><div className="grid grid-cols-2 gap-4 p-4 max-[900px]:grid-cols-1">{slots.map(slot => <SessionSlot key={slot.id} slot={slot} onConnect={connect}/>)}</div></section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">Distribuição</span><h2>Como os números trabalham juntos</h2></div></div><div className="grid grid-cols-3 gap-4 p-5 max-[900px]:grid-cols-1">
      <div className="rounded-xl border border-[#e5ebe6] p-4"><strong className="text-sm text-[#2a3c30]">Equilibrada</strong><p className="mt-2 text-[11px] leading-5 text-[#819087]">100 contatos e 4 sessões ativas: 25 jobs para cada número.</p></div>
      <div className="rounded-xl border border-[#e5ebe6] p-4"><strong className="text-sm text-[#2a3c30]">Ponderada</strong><p className="mt-2 text-[11px] leading-5 text-[#819087]">Defina pesos diferentes quando unidades ou equipes tiverem capacidades diferentes.</p></div>
      <div className="rounded-xl border border-[#e5ebe6] p-4"><strong className="text-sm text-[#2a3c30]">Por lista</strong><p className="mt-2 text-[11px] leading-5 text-[#819087]">Ex.: clientes SP usam o número de SP; clientes RJ usam o número de RJ.</p></div>
    </div></section>
  </>;
}

function CampaignsPage({ slots }: { slots: Slot[] }) {
  const active = slots.filter(s => s.status === "connected");
  const demoTotal = 103;
  const allocation = active.length ? active.map((slot, index) => ({ slot, jobs: Math.floor(demoTotal / active.length) + (index < demoTotal % active.length ? 1 : 0) })) : [];
  return <>
    <div className="page-heading"><div><span className="eyebrow">Operação</span><h1>Campanhas</h1><p>Crie uma campanha e distribua jobs entre as sessões conectadas.</p></div><button className="btn btn-primary"><Plus size={17}/>Nova campanha</button></div>
    <div className="filterbar"><div className="search"><Search size={17}/><input placeholder="Buscar campanha..."/></div><button className="btn btn-soft"><ListFilter size={16}/>Filtros</button></div>
    <section className="panel mb-4"><div className="panel-title"><div><span className="eyebrow">Distribuidor</span><h2>Prévia: 103 destinatários</h2></div><StatusPill tone={active.length ? "success" : "warning"}>{active.length} sessões ativas</StatusPill></div>
      {active.length ? <div className="grid grid-cols-2 gap-3 p-4 max-[700px]:grid-cols-1">{allocation.map(({slot,jobs}) => <div key={slot.id} className="flex items-center justify-between rounded-xl border border-[#e5ebe6] p-4"><div><strong className="block text-sm text-[#2a3c30]">{slot.name}</strong><span className="mt-1 block text-[11px] text-[#87958c]">{slot.phone}</span></div><strong className="text-lg text-[#159447]">{jobs} jobs</strong></div>)}</div> : <EmptyState icon={Smartphone} title="Nenhuma sessão ativa" description="Conecte pelo menos um número real antes de criar a distribuição da campanha." />}
    </section>
    <section className="panel"><EmptyState icon={Send} title="Nenhuma campanha criada" description="As campanhas serão processadas no backend, com fila, lock, retry controlado e continuidade mesmo com o navegador fechado." action="Criar campanha"/></section>
  </>;
}

function ContactsPage() { return <><div className="page-heading"><div><span className="eyebrow">Base de contatos</span><h1>Contatos</h1><p>Importe contatos, normalize telefones e mantenha registro de consentimento e supressão.</p></div><div className="actions"><button className="btn btn-soft">Importar arquivo</button><button className="btn btn-primary"><Plus size={17}/>Adicionar contato</button></div></div><div className="mini-metrics"><div><span>Total</span><strong>0</strong></div><div><span>Opt-in</span><strong>0</strong></div><div><span>Opt-out</span><strong>0</strong></div><div><span>Bloqueados</span><strong>0</strong></div></div><section className="panel"><EmptyState icon={ContactRound} title="Nenhum contato cadastrado" description="Importe TXT, CSV ou XLSX. Contatos sem autorização não entram automaticamente em campanhas." action="Importar contatos"/></section></> }

function GenericPage({ section }: { section: Section }) {
  const map: Record<Exclude<Section,"Dashboard"|"Campanhas"|"Contatos"|"WhatsApp">,[typeof Gauge,string,string,string]> = {
    Listas:[Layers3,"Listas de contatos","Crie segmentos reutilizáveis e associe listas a remetentes específicos.","Criar lista"],
    Conversas:[Inbox,"Inbox","Centralize respostas recebidas de todos os números conectados.","Nenhuma conversa recebida"],
    Templates:[FileText,"Templates","Organize mensagens reutilizáveis e variáveis de personalização.","Criar template"],
    Agendamentos:[CalendarClock,"Agendamentos","Programe campanhas e janelas de processamento no backend.","Criar agendamento"],
    Relatórios:[BarChart3,"Relatórios","Compare desempenho por campanha, lista e número remetente.","Nenhum dado para analisar"],
    Logs:[Activity,"Logs operacionais","Acompanhe sessão, fila, envio, falha e reconexão sem expor segredos.","Nenhum evento registrado"],
    Equipe:[Users,"Equipe","Gerencie Owner, Admin, Manager, Operator e Viewer.","Convidar membro"],
    Assinatura:[WalletCards,"Assinatura","Controle limites de sessões e recursos por plano.","Gerenciar plano"],
    Configurações:[Settings,"Configurações","Configure gateway, segurança, notificações e comportamento das filas.","Configurar workspace"],
  };
  const [Icon,title,description,action]=map[section as keyof typeof map];
  return <><div className="page-heading"><div><span className="eyebrow">ZapFlow</span><h1>{title}</h1><p>{description}</p></div><button className="btn btn-primary"><Plus size={17}/>{action}</button></div><section className="panel"><EmptyState icon={Icon} title={section === "Conversas" || section === "Relatórios" || section === "Logs" ? action : `Nenhum item em ${title.toLowerCase()}`} description="Esta área começa vazia e será alimentada somente por dados reais da sua organização."/></section></>;
}

function ZapFlowApp() {
  const [section,setSection]=useState<Section>("Dashboard");
  const [mobileOpen,setMobileOpen]=useState(false);
  const [slots,setSlots]=useState<Slot[]>(initialSlots);
  const connected=slots.filter(s=>s.status==="connected").length;
  const title=useMemo(()=>section,[section]);
  const navigate=(label:Section)=>{setSection(label);setMobileOpen(false)};
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen?"open":""}`}><div className="sidebar-top"><Logo/><button className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={20}/></button></div><div className="workspace-switch"><div className="workspace-avatar">Z</div><div><span>Workspace</span><strong>ZapFlow</strong></div><ChevronDown size={16}/></div><nav>{primaryNav.map(({label,icon:Icon})=><button key={label} className={section===label?"active":""} onClick={()=>navigate(label)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="nav-divider"/><nav>{secondaryNav.map(({label,icon:Icon})=><button key={label} className={section===label?"active":""} onClick={()=>navigate(label)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="help-card"><Sparkles size={18}/><strong>Gateway de sessões</strong><span>Conecte o provedor para liberar QR e manter os 10 números ativos.</span><button onClick={()=>navigate("WhatsApp")}>Configurar agora</button></div><button className="account-row"><div className="avatar">VS</div><div><strong>Minha conta</strong><span>Owner</span></div><MoreHorizontal size={17}/></button></div></aside>{mobileOpen&&<button className="scrim" onClick={()=>setMobileOpen(false)} aria-label="Fechar menu"/>}<main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div><span>ZapFlow</span><strong>{title}</strong></div></div><div className="topbar-actions"><div className="global-search"><Search size={16}/><span>Buscar</span><kbd>⌘ K</kbd></div><button className="icon-btn"><CircleHelp size={19}/></button><button className="icon-btn notification"><Bell size={19}/><i/></button><button className="profile-btn">VS</button></div></header><div className="content-wrap">{section==="Dashboard"&&<Dashboard connected={connected}/>} {section==="Campanhas"&&<CampaignsPage slots={slots}/>} {section==="Contatos"&&<ContactsPage/>} {section==="WhatsApp"&&<WhatsAppPage slots={slots} setSlots={setSlots}/>} {!(["Dashboard","Campanhas","Contatos","WhatsApp"] as Section[]).includes(section)&&<GenericPage section={section}/>}<footer className="app-footer"><span><ShieldCheck size={12}/>ZapFlow • backend multi-tenant</span><span>10 sessões por organização</span></footer></div></main></div>;
}
