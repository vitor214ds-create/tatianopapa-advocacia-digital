import { createFileRoute } from "@tanstack/react-router";
import { Activity, BarChart3, CalendarClock, ContactRound, FileText, Gauge, Inbox, Layers3, MessageCircle, Send, Settings, Smartphone, Users, WalletCards, Zap } from "lucide-react";

export const Route = createFileRoute("/inside")({ component: InsidePreview });

const nav = [
  ["Dashboard", Gauge], ["Campanhas", Send], ["Contatos", ContactRound], ["Listas", Layers3],
  ["Conversas", Inbox], ["Templates", FileText], ["WhatsApp", MessageCircle], ["Agendamentos", CalendarClock],
  ["Relatórios", BarChart3], ["Logs", Activity], ["Equipe", Users], ["Assinatura", WalletCards], ["Configurações", Settings],
] as const;

function InsidePreview() {
  return <div className="min-h-screen bg-[#f4f7f4] text-[#26392d]">
    <div className="flex min-h-screen">
      <aside className="hidden w-[260px] shrink-0 flex-col bg-[#123d25] p-5 text-white md:flex">
        <div className="mb-8 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#28b45c]"><Zap size={21}/></div><div><strong className="block">ZapFlow</strong><span className="text-xs text-white/55">Acesso interno</span></div></div>
        <nav className="space-y-1">{nav.map(([label,Icon],i)=><button key={label} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${i===0?"bg-white/12 text-white":"text-white/70 hover:bg-white/8 hover:text-white"}`}><Icon size={17}/>{label}</button>)}</nav>
        <div className="mt-auto rounded-2xl bg-white/8 p-4 text-xs leading-5 text-white/65">Modo de visualização interna. Nenhuma ação real de envio é executada nesta rota.</div>
      </aside>
      <main className="flex-1 p-5 sm:p-8">
        <header className="mb-7 flex items-center justify-between"><div><span className="text-xs font-semibold uppercase tracking-[.16em] text-[#269451]">Visão interna</span><h1 className="mt-1 text-2xl font-semibold">Central de operações</h1><p className="mt-1 text-sm text-[#76857c]">Visualize a estrutura completa do ZapFlow sem depender do login.</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">Modo visual</span></header>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[["Números conectados","0/10",Smartphone],["Campanhas","0",Send],["Contatos","0",ContactRound],["Conversas","0",Inbox]].map(([label,value,Icon])=><div key={String(label)} className="rounded-2xl border border-[#dfe8e1] bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><span className="text-sm text-[#718078]">{String(label)}</span><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef7f1] text-[#269451]"><Icon size={17}/></div></div><strong className="text-2xl">{String(value)}</strong><p className="mt-2 text-xs text-[#909b94]">Dados reais aparecem quando o backend estiver conectado.</p></div>)}
        </section>
        <section className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_.9fr]">
          <div className="rounded-2xl border border-[#dfe8e1] bg-white p-6 shadow-sm"><div className="mb-5"><span className="text-xs font-semibold uppercase tracking-[.14em] text-[#269451]">Primeiros passos</span><h2 className="mt-1 text-lg font-semibold">Estrutura do aplicativo</h2></div><div className="space-y-3">{["Autenticação e organizações","Gateway Evolution/Baileys","Até 10 números WhatsApp","Fila persistente de campanhas"].map((item,i)=><div key={item} className="flex items-center gap-3 rounded-xl border border-[#edf1ee] p-4"><div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${i===0?"bg-[#e9f7ee] text-[#269451]":"bg-[#f3f5f3] text-[#7f8b84]"}`}>{i+1}</div><div><strong className="block text-sm">{item}</strong><span className="text-xs text-[#89958e]">Módulo disponível na interface do ZapFlow.</span></div></div>)}</div></div>
          <div className="rounded-2xl border border-[#dfe8e1] bg-white p-6 shadow-sm"><span className="text-xs font-semibold uppercase tracking-[.14em] text-[#269451]">WhatsApp</span><h2 className="mt-1 text-lg font-semibold">Sessões</h2><div className="mt-5 space-y-3">{Array.from({length:4}).map((_,i)=><div key={i} className="flex items-center justify-between rounded-xl border border-[#edf1ee] p-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f1f5f2]"><Smartphone size={16}/></div><div><strong className="block text-sm">WhatsApp {String(i+1).padStart(2,"0")}</strong><span className="text-xs text-[#8b9890]">Desconectado</span></div></div><span className="h-2.5 w-2.5 rounded-full bg-[#c6cec9]"/></div>)}</div></div>
        </section>
      </main>
    </div>
  </div>;
}
