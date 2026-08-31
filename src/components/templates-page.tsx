import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { deleteTemplate, listTemplates, saveTemplate, type MessageTemplate } from "../lib/zapflow-api";

type Props = { organizationId: string };

type Draft = {
  id?: string;
  name: string;
  content: string;
  category: string;
};

const emptyDraft: Draft = { name: "", content: "", category: "general" };

function detectedVariables(content: string) {
  return [...new Set([...content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map(match => match[1]))];
}

export function TemplatesPage({ organizationId }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variables = useMemo(() => detectedVariables(draft.content), [draft.content]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await listTemplates(organizationId);
      setTemplates(response.templates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [organizationId]);

  function startCreate() {
    setDraft(emptyDraft);
    setEditing(true);
    setError(null);
  }

  function startEdit(template: MessageTemplate) {
    setDraft({ id: template.id, name: template.name, content: template.content, category: template.category || "general" });
    setEditing(true);
    setError(null);
  }

  async function submit() {
    const name = draft.name.trim();
    const content = draft.content.trim();
    if (name.length < 2) { setError("Informe um nome para o template."); return; }
    if (!content) { setError("Escreva a mensagem do template."); return; }
    setSaving(true);
    try {
      await saveTemplate({ organizationId, id: draft.id, name, content, category: draft.category });
      setEditing(false);
      setDraft(emptyDraft);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o template.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: MessageTemplate) {
    if (!window.confirm(`Excluir o template “${template.name}”?`)) return;
    try {
      await deleteTemplate(organizationId, template.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o template.");
    }
  }

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">Mensagens reutilizáveis</span><h1>Templates</h1><p>Crie mensagens padronizadas e use variáveis como {"{{nome}}"}. Os templates ficam salvos no seu workspace.</p></div>
      <button className="btn btn-primary" onClick={startCreate}><Plus size={17}/>Criar template</button>
    </div>

    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    {editing && <section className="panel mb-4">
      <div className="panel-title"><div><span className="eyebrow">{draft.id ? "Editar" : "Novo"}</span><h2>{draft.id ? "Editar template" : "Criar template"}</h2></div><button className="btn btn-soft" onClick={() => setEditing(false)}><X size={16}/>Cancelar</button></div>
      <div className="grid gap-4 p-4">
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Nome
          <input className="h-11 rounded-xl border border-[#dfe7e1] bg-white px-3 outline-none focus:border-[#269451]" maxLength={80} value={draft.name} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} placeholder="Ex.: Primeiro contato"/>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Categoria
          <select className="h-11 rounded-xl border border-[#dfe7e1] bg-white px-3 outline-none focus:border-[#269451]" value={draft.category} onChange={e => setDraft(current => ({ ...current, category: e.target.value }))}>
            <option value="general">Geral</option><option value="followup">Follow-up</option><option value="notification">Notificação</option><option value="support">Atendimento</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-[#304237]">Mensagem
          <textarea className="min-h-40 rounded-xl border border-[#dfe7e1] bg-white p-3 outline-none focus:border-[#269451]" maxLength={4000} value={draft.content} onChange={e => setDraft(current => ({ ...current, content: e.target.value }))} placeholder="Olá {{nome}}, tudo bem?"/>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#718077]">{draft.content.length}/4000 caracteres{variables.length ? ` • Variáveis: ${variables.map(v => `{{${v}}}`).join(", ")}` : ""}</div>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Salvar template</button>
        </div>
      </div>
    </section>}

    <section className="panel">
      {loading ? <div className="grid min-h-52 place-items-center text-sm text-[#718077]"><div className="text-center"><Loader2 size={24} className="mx-auto mb-2 animate-spin"/>Carregando templates...</div></div> : templates.length === 0 ? <div className="empty-state"><div className="empty-icon"><FileText size={23}/></div><h3>Nenhum template criado</h3><p>Crie seu primeiro template para reutilizar mensagens nas campanhas.</p><button className="btn btn-primary" onClick={startCreate}><Plus size={16}/>Criar template</button></div> : <div className="grid gap-3 p-4">
        {templates.map(template => <article key={template.id} className="rounded-2xl border border-[#e2e9e3] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div><strong className="block text-sm text-[#26392d]">{template.name}</strong><span className="mt-1 block text-[11px] uppercase tracking-wide text-[#87958c]">{template.category || "general"}</span></div>
            <div className="flex gap-2"><button className="btn btn-soft" onClick={() => startEdit(template)}><Pencil size={15}/>Editar</button><button className="btn btn-soft" onClick={() => void remove(template)} title="Excluir"><Trash2 size={15}/></button></div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#526158]">{template.content}</p>
          {template.variables?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{template.variables.map(variable => <span key={variable} className="rounded-full bg-[#edf8f0] px-2.5 py-1 text-[11px] font-semibold text-[#269451]">{`{{${variable}}}`}</span>)}</div>}
        </article>)}
      </div>}
    </section>
  </>;
}
