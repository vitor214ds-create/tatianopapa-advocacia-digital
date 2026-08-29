import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  ContactRound,
  FileText,
  Gauge,
  Inbox,
  Layers3,
  ListFilter,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({ component: ZapFlowApp });

type Section =
  | "Dashboard"
  | "Campanhas"
  | "Contatos"
  | "Listas"
  | "Conversas"
  | "Templates"
  | "WhatsApp"
  | "Agendamentos"
  | "Relatórios"
  | "Logs"
  | "Equipe"
  | "Assinatura"
  | "Configurações";

const primaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Dashboard", icon: Gauge },
  { label: "Campanhas", icon: Send },
  { label: "Contatos", icon: ContactRound },
  { label: "Listas", icon: Layers3 },
  { label: "Conversas", icon: Inbox },
  { label: "Templates", icon: FileText },
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Agendamentos", icon: CalendarClock },
  { label: "Relatórios", icon: BarChart3 },
  { label: "Logs", icon: Activity },
];

const secondaryNav: { label: Section; icon: typeof Gauge }[] = [
  { label: "Equipe", icon: Users },
  { label: "Assinatura", icon: WalletCards },
  { label: "Configurações", icon: Settings },
];

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark"><Zap size={20} strokeWidth={2.6} /></div>
      <div><strong>ZapFlow</strong><span>WhatsApp Operations</span></div>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "success" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function Metric({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Gauge }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={18} /></div></div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Gauge; title: string; description: string; action?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={23} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <button className="btn btn-primary"><Plus size={16} />{action}</button>}
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Visão geral</span><h1>Central de operações</h1><p>Acompanhe sua estrutura de atendimento e campanhas em um só lugar.</p></div>
        <button className="btn btn-primary"><Plus size={17} />Nova campanha</button>
      </div>
      <div className="metrics-grid">
        <Metric label="Enviadas hoje" value="0" helper="Dados reais após a primeira campanha" icon={Send} />
        <Metric label="Entregues" value="0" helper="Aguardando eventos da Meta" icon={CheckCircle2} />
        <Metric label="Respostas" value="0" helper="Inbox ainda sem conversas" icon={MessageCircle} />
        <Metric label="Falhas" value="0" helper="Nenhuma falha registrada" icon={AlertTriangle} />
      </div>
      <div className="dashboard-grid">
        <section className="panel panel-main">
          <div className="panel-title"><div><span className="eyebrow">Primeiros passos</span><h2>Prepare sua operação</h2></div><StatusPill tone="warning">3 etapas pendentes</StatusPill></div>
          <div className="setup-list">
            <div className="setup-row"><div className="setup-index done"><CheckCircle2 size={17} /></div><div><strong>Banco de dados do ZapFlow</strong><span>Estrutura multi-tenant, filas e políticas de acesso configuradas.</span></div><StatusPill tone="success">Pronto</StatusPill></div>
            <div className="setup-row"><div className="setup-index">2</div><div><strong>Conectar WhatsApp Business</strong><span>Autorize uma conta oficial da Meta para habilitar envios e webhooks.</span></div><button className="btn btn-soft">Configurar</button></div>
            <div className="setup-row"><div className="setup-index">3</div><div><strong>Importar contatos autorizados</strong><span>Adicione contatos com registro de consentimento e origem do opt-in.</span></div><button className="btn btn-soft">Importar</button></div>
            <div className="setup-row"><div className="setup-index">4</div><div><strong>Sincronizar templates</strong><span>Use apenas modelos aprovados pela WhatsApp Business Platform.</span></div><button className="btn btn-soft">Ver templates</button></div>
          </div>
        </section>
        <section className="panel health-card">
          <div className="panel-title"><div><span className="eyebrow">Sistema</span><h2>Saúde da integração</h2></div><Webhook size={19} /></div>
          <div className="health-score"><div className="score-ring"><span>—</span></div><div><strong>Aguardando Meta</strong><p>Não mostramos uma conexão falsa. Autorize sua conta para iniciar a validação.</p></div></div>
          <div className="health-lines"><span><i className="dot ok" />Supabase ativo</span><span><i className="dot wait" />WhatsApp não configurado</span><span><i className="dot wait" />Webhook aguardando</span></div>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-title"><div><span className="eyebrow">Atividade</span><h2>Campanhas recentes</h2></div><button className="btn btn-ghost">Ver todas</button></div>
        <EmptyState icon={Send} title="Nenhuma campanha criada" description="Quando você criar sua primeira campanha, progresso, entrega, leitura, respostas e falhas aparecerão aqui com dados confirmados pelo provedor." action="Criar primeira campanha" />
      </section>
    </>
  );
}

function WhatsAppPage() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Integrações</span><h1>Números WhatsApp</h1><p>Gerencie números oficiais conectados à WhatsApp Business Platform.</p></div><button className="btn btn-primary"><Plus size={17} />Conectar número</button></div>
      <div className="notice"><ShieldCheck size={20} /><div><strong>Conexão oficial e segura</strong><p>O ZapFlow foi estruturado para Meta Cloud API. Tokens e segredos devem permanecer no backend e nenhum status será simulado.</p></div></div>
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Remetentes</span><h2>0 de 10 números conectados</h2></div><StatusPill tone="warning">Configuração necessária</StatusPill></div><EmptyState icon={MessageCircle} title="Nenhum número conectado" description="Conecte um WhatsApp Business oficial para liberar templates, webhooks, testes e campanhas. O ZapFlow não utiliza automação de WhatsApp Web." action="Conectar WhatsApp" /></section>
    </>
  );
}

function CampaignsPage() {
  return (
    <><div className="page-heading"><div><span className="eyebrow">Operação</span><h1>Campanhas</h1><p>Crie campanhas consentidas, distribua remetentes e acompanhe cada evento.</p></div><button className="btn btn-primary"><Plus size={17} />Nova campanha</button></div><div className="filterbar"><div className="search"><Search size={17} /><input placeholder="Buscar campanha..." /></div><button className="btn btn-soft"><ListFilter size={16} />Filtros</button></div><section className="panel"><EmptyState icon={Send} title="Sua operação começa aqui" description="Nenhuma campanha existe no banco ainda. Crie uma campanha, selecione apenas contatos elegíveis, defina remetentes autorizados e revise tudo antes do processamento." action="Criar campanha" /></section></>
  );
}

function ContactsPage() {
  return (
    <><div className="page-heading"><div><span className="eyebrow">Base de contatos</span><h1>Contatos</h1><p>Centralize telefones, tags, origem e histórico de consentimento.</p></div><div className="actions"><button className="btn btn-soft">Importar arquivo</button><button className="btn btn-primary"><Plus size={17} />Adicionar contato</button></div></div><div className="mini-metrics"><div><span>Total</span><strong>0</strong></div><div><span>Opt-in</span><strong>0</strong></div><div><span>Opt-out</span><strong>0</strong></div><div><span>Bloqueados</span><strong>0</strong></div></div><section className="panel"><div className="filterbar embedded"><div className="search"><Search size={17} /><input placeholder="Buscar nome ou telefone..." /></div><button className="btn btn-soft"><ListFilter size={16} />Status</button></div><EmptyState icon={ContactRound} title="Nenhum contato cadastrado" description="Importe TXT, CSV ou XLSX, normalize os telefones e registre o consentimento antes de usar contatos em campanhas." action="Importar contatos" /></section></>
  );
}

function GenericPage({ section }: { section: Section }) {
  const content: Record<Exclude<Section, "Dashboard" | "Campanhas" | "Contatos" | "WhatsApp">, [typeof Gauge, string, string, string]> = {
    Listas: [Layers3, "Listas de contatos", "Organize contatos em segmentos reutilizáveis para campanhas e automações.", "Criar lista"],
    Conversas: [Inbox, "Inbox", "Respostas recebidas via webhook aparecerão aqui, ligadas ao contato e remetente corretos.", "Nenhuma conversa recebida"],
    Templates: [FileText, "Templates", "Sincronize e acompanhe os modelos oficiais aprovados pela Meta.", "Adicionar template"],
    Agendamentos: [CalendarClock, "Agendamentos", "Programe campanhas respeitando horário, timezone e janela operacional.", "Criar agendamento"],
    Relatórios: [BarChart3, "Relatórios", "Analise entrega, leitura, respostas, falhas e opt-outs usando somente eventos confirmados.", "Nenhum dado para analisar"],
    Logs: [Activity, "Logs operacionais", "Acompanhe jobs, webhooks, erros e eventos sem expor credenciais sensíveis.", "Nenhum evento registrado"],
    Equipe: [Users, "Equipe", "Gerencie Owner, Admin, Manager, Operator e Viewer com isolamento por organização.", "Convidar membro"],
    Assinatura: [WalletCards, "Assinatura", "Planos Starter, Pro e Business já possuem limites estruturados no banco.", "Gerenciar plano"],
    Configurações: [Settings, "Configurações", "Defina organização, segurança, notificações e preferências operacionais.", "Configurar workspace"],
  };
  const [Icon, title, description, action] = content[section as keyof typeof content];
  return <><div className="page-heading"><div><span className="eyebrow">ZapFlow</span><h1>{title}</h1><p>{description}</p></div><button className="btn btn-primary"><Plus size={17} />{action}</button></div><section className="panel"><EmptyState icon={Icon} title={section === "Conversas" || section === "Relatórios" || section === "Logs" ? action : `Nenhum item em ${title.toLowerCase()}`} description="Esta área está conectada à estrutura real do produto e começa vazia. Dados aparecerão quando sua organização iniciar a operação." /></section></>;
}

function ZapFlowApp() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = useMemo(() => section, [section]);
  const navigate = (label: Section) => { setSection(label); setMobileOpen(false); };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">Z</div><div><span>Workspace</span><strong>ZapFlow</strong></div><ChevronDown size={16} /></div>
        <nav>{primaryNav.map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={18} /><span>{label}</span></button>)}</nav>
        <div className="nav-divider" />
        <nav>{secondaryNav.map(({ label, icon: Icon }) => <button key={label} className={section === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={18} /><span>{label}</span></button>)}</nav>
        <div className="sidebar-bottom"><div className="help-card"><Sparkles size={18} /><strong>Comece pela integração</strong><span>Conecte a Meta para liberar sua operação.</span><button onClick={() => navigate("WhatsApp")}>Configurar agora</button></div><button className="account-row"><div className="avatar">VS</div><div><strong>Minha conta</strong><span>Owner</span></div><MoreHorizontal size={17} /></button></div>
      </aside>
      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div><span>ZapFlow</span><strong>{title}</strong></div></div><div className="topbar-actions"><div className="global-search"><Search size={16} /><span>Buscar</span><kbd>⌘ K</kbd></div><button className="icon-btn"><CircleHelp size={19} /></button><button className="icon-btn notification"><Bell size={19} /><i /></button><button className="profile-btn">VS</button></div></header>
        <div className="content-wrap">
          {section === "Dashboard" && <Dashboard />}
          {section === "Campanhas" && <CampaignsPage />}
          {section === "Contatos" && <ContactsPage />}
          {section === "WhatsApp" && <WhatsAppPage />}
          {!(["Dashboard", "Campanhas", "Contatos", "WhatsApp"] as Section[]).includes(section) && <GenericPage section={section} />}
          <footer className="app-footer"><span><ShieldCheck size={14} />Estrutura preparada para WhatsApp Business Platform oficial</span><span>ZapFlow • Ambiente seguro</span></footer>
        </div>
      </main>
    </div>
  );
}
