import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LockKeyhole, Mail, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getAuthState, login } from "../lib/zapflow-api";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAuthState()
      .then(auth => {
        if (auth.authenticated && auth.activeOrganizationId) navigate({ to: "/" });
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const auth = await login(email, password);
      if (!auth.authenticated || !auth.activeOrganizationId) throw new Error("Não foi possível iniciar sua sessão.");
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-[#26392d]">
    <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl place-items-center">
      <div className="grid w-full overflow-hidden rounded-[28px] border border-[#dfe8e1] bg-white shadow-[0_24px_80px_rgba(24,64,35,.10)] md:grid-cols-2">
        <section className="hidden bg-[#123d25] p-10 text-white md:flex md:flex-col md:justify-between">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#28b45c]"><Zap size={22}/></div><div><strong className="block text-lg">ZapFlow</strong><span className="text-xs text-white/60">Multi-session WhatsApp</span></div></div>
          <div><span className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs">Acesso administrativo</span><h1 className="text-3xl font-semibold leading-tight">Suas sessões, campanhas e filas em um único lugar.</h1><p className="mt-4 text-sm leading-6 text-white/65">Entre com sua conta Owner para acessar o painel completo do ZapFlow.</p></div>
          <div className="flex items-center gap-2 text-xs text-white/60"><ShieldCheck size={16}/>Sessão segura e permissões Owner/Admin</div>
        </section>
        <section className="p-7 sm:p-10">
          <div className="mb-8 md:hidden"><div className="flex items-center gap-2 font-semibold"><Zap size={20} className="text-[#239e50]"/>ZapFlow</div></div>
          <span className="text-xs font-semibold uppercase tracking-[.16em] text-[#269451]">Acesso seguro</span>
          <h2 className="mt-2 text-2xl font-semibold">Entrar no ZapFlow</h2>
          <p className="mt-2 text-sm text-[#78877e]">Use seu e-mail e senha de administrador.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-medium">E-mail<div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dfe7e1] px-3 focus-within:border-[#269451]"><Mail size={17} className="text-[#87958c]"/><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="h-12 w-full outline-none" placeholder="voce@empresa.com"/></div></label>
            <label className="block text-sm font-medium">Senha<div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dfe7e1] px-3 focus-within:border-[#269451]"><LockKeyhole size={17} className="text-[#87958c]"/><input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 w-full outline-none" placeholder="Sua senha"/></div></label>
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <button disabled={loading || checking} className="mt-2 h-12 w-full rounded-xl bg-[#249b4e] font-semibold text-white transition hover:bg-[#1f8844] disabled:cursor-wait disabled:opacity-60">{checking ? "Verificando sessão..." : loading ? "Entrando..." : "Entrar"}</button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-[#8b9890]">Se a configuração Supabase falhar, o acesso Owner de contingência continua disponível no servidor.</p>
        </section>
      </div>
    </div>
  </main>;
}
