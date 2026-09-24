import {
  Headphones, Loader2, MessageCircle, Mic, RefreshCw, Search, Send, Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getChatMedia,
  listChatMessages,
  listChatThreads,
  markChatRead,
  sendChatAudio,
  sendChatText,
  type ChatMessage,
  type ChatThread,
} from "../lib/zapflow-api";

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatListTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatClock(value);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function initials(name?: string | null, phone?: string) {
  const source = (name || phone || "?").trim();
  return source.slice(0, 2).toUpperCase();
}

function AudioMessage({
  organizationId,
  message,
}: {
  organizationId: string;
  message: ChatMessage;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (src || loading) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getChatMedia(organizationId, message.id);
      setSrc(`data:${data.mimetype || "audio/ogg"};base64,${data.base64}`);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (src) {
    return <audio controls preload="metadata" src={src} className="max-w-[260px]"/>;
  }

  return <button
    className="flex items-center gap-2 rounded-full border border-current/15 px-3 py-2 text-xs font-semibold"
    onClick={() => void load()}
    disabled={loading}
  >
    {loading ? <Loader2 size={15} className="animate-spin"/> : <Headphones size={15}/>}
    {error ? "Tentar carregar áudio novamente" : "Ouvir áudio"}
  </button>;
}

export function ChatPage({ organizationId }: { organizationId: string }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selected = threads.find(item => item.id === selectedId) || null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter(item =>
      (item.contact_name || "").toLowerCase().includes(term) ||
      item.contact_phone.includes(term) ||
      (item.account_name || "").toLowerCase().includes(term)
    );
  }, [threads, search]);

  async function refreshThreads(silent = false) {
    if (!silent) setLoadingThreads(true);
    try {
      const data = await listChatThreads(organizationId);
      setThreads(data.threads || []);
      setSelectedId(current => current || data.threads?.[0]?.id || null);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Não foi possível carregar as conversas.");
    } finally {
      if (!silent) setLoadingThreads(false);
    }
  }

  async function refreshMessages(threadId: string, silent = false) {
    if (!silent) setLoadingMessages(true);
    try {
      const data = await listChatMessages(organizationId, threadId);
      setMessages(data.messages || []);
      await markChatRead(organizationId, threadId).catch(() => undefined);
      setThreads(current => current.map(item => item.id === threadId ? { ...item, unread_count: 0 } : item));
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Não foi possível carregar as mensagens.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  useEffect(() => {
    void refreshThreads();
    const id = window.setInterval(() => void refreshThreads(true), 4000);
    return () => window.clearInterval(id);
  }, [organizationId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void refreshMessages(selectedId);
    const id = window.setInterval(() => void refreshMessages(selectedId, true), 3000);
    return () => window.clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function sendTextMessage() {
    if (!selectedId || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    const value = text.trim();
    setText("");
    try {
      const result = await sendChatText(organizationId, selectedId, value);
      setMessages(current => [...current.filter(item => item.id !== result.message.id), result.message]);
      await refreshThreads(true);
    } catch (err) {
      setText(value);
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function blobToBase64(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function startRecording() {
    if (!selectedId || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);

        if (!blob.size) return;
        if (blob.size > 8_000_000) {
          setError("O áudio ficou muito grande. Grave uma mensagem menor.");
          return;
        }

        setSending(true);
        try {
          const base64 = await blobToBase64(blob);
          const result = await sendChatAudio(
            organizationId,
            selectedId,
            base64,
            blob.type || "audio/webm",
          );
          setMessages(current => [...current.filter(item => item.id !== result.message.id), result.message]);
          await refreshThreads(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível enviar o áudio.");
        } finally {
          setSending(false);
        }
      };

      recorder.start(250);
      setRecording(true);
    } catch {
      setError("Não foi possível acessar o microfone. Autorize o uso do microfone no navegador.");
    }
  }

  function stopRecording() {
    if (!recording) return;
    recorderRef.current?.stop();
  }

  return <div className="grid gap-4">
    <div className="page-heading">
      <div>
        <span className="eyebrow">Atendimento</span>
        <h1>Chat</h1>
        <p>Responda as mensagens que chegam nos números conectados sem sair do ZapFlow.</p>
      </div>
      <button className="btn btn-soft" onClick={() => void refreshThreads()}>
        <RefreshCw size={16}/>Atualizar
      </button>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

    <section className="panel overflow-hidden">
      <div className="grid min-h-[650px] grid-cols-[340px_1fr] max-[900px]:grid-cols-1">
        <aside className="border-r border-[#e7ece8] bg-white max-[900px]:border-b max-[900px]:border-r-0">
          <div className="border-b border-[#edf1ee] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <span className="eyebrow">Conversas</span>
                <h2 className="text-lg font-semibold text-[#26382d]">Caixa de entrada</h2>
              </div>
              <span className="rounded-full bg-[#edf7f0] px-2.5 py-1 text-xs font-semibold text-[#218549]">
                {threads.reduce((sum, item) => sum + item.unread_count, 0)} novas
              </span>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[#dfe7e1] bg-[#fbfcfb] px-3">
              <Search size={16} className="text-[#849088]"/>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar conversa"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          <div className="max-h-[575px] overflow-y-auto">
            {loadingThreads
              ? <div className="grid place-items-center p-10 text-sm text-[#718077]"><Loader2 className="mb-2 animate-spin"/>Carregando...</div>
              : filtered.length
                ? filtered.map(thread => <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={`flex w-full gap-3 border-b border-[#f0f3f1] p-4 text-left transition hover:bg-[#f8faf8] ${selectedId === thread.id ? "bg-[#f0f8f2]" : ""}`}
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#dcefe2] text-sm font-bold text-[#247747]">
                      {initials(thread.contact_name, thread.contact_phone)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="truncate text-sm text-[#26382d]">{thread.contact_name || thread.contact_phone}</strong>
                        <span className="shrink-0 text-[10px] text-[#93a098]">{formatListTime(thread.last_message_at)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-[#718077]">{thread.last_message_preview}</span>
                        {thread.unread_count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#23a455] px-1 text-[10px] font-bold text-white">{thread.unread_count}</span>}
                      </div>
                      <span className="mt-1 block truncate text-[10px] text-[#9aa59e]">
                        via {thread.account_name || thread.account_phone || thread.session_id}
                      </span>
                    </div>
                  </button>)
                : <div className="grid place-items-center p-10 text-center text-sm text-[#7b8980]">
                    <MessageCircle size={26} className="mb-2"/>
                    <strong>Nenhuma conversa ainda</strong>
                    <span className="mt-1 text-xs">As mensagens recebidas aparecerão aqui automaticamente.</span>
                  </div>}
          </div>
        </aside>

        <div className="flex min-h-[650px] flex-col bg-[#f4f7f4]">
          {selected ? <>
            <header className="flex items-center justify-between gap-3 border-b border-[#e3e9e5] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[#dcefe2] text-sm font-bold text-[#247747]">
                  {initials(selected.contact_name, selected.contact_phone)}
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-[#25372c]">{selected.contact_name || selected.contact_phone}</strong>
                  <span className="block truncate text-[11px] text-[#809087]">
                    {selected.contact_phone} • respondendo por {selected.account_name || selected.account_phone || selected.session_id}
                  </span>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {loadingMessages
                ? <div className="grid h-full place-items-center text-sm text-[#718077]"><Loader2 className="animate-spin"/></div>
                : <div className="grid gap-2">
                    {messages.map(message => <div
                      key={message.id}
                      className={`flex ${message.direction === "OUT" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.direction === "OUT" ? "rounded-br-md bg-[#d9fdd3] text-[#27382d]" : "rounded-bl-md bg-white text-[#27382d]"}`}>
                        {message.message_type === "TEXT"
                          ? <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.text_content}</p>
                          : message.message_type === "AUDIO"
                            ? <AudioMessage organizationId={organizationId} message={message}/>
                            : <p className="text-sm">{message.text_content || ({
                                IMAGE: "🖼️ Imagem recebida",
                                VIDEO: "🎥 Vídeo recebido",
                                DOCUMENT: "📎 Documento recebido",
                                OTHER: "Mensagem recebida",
                              } as Record<string,string>)[message.message_type]}</p>}
                        <span className="mt-1 block text-right text-[9px] text-[#748178]">{formatClock(message.sent_at)}</span>
                      </div>
                    </div>)}
                    <div ref={bottomRef}/>
                  </div>}
            </div>

            <footer className="border-t border-[#dfe6e1] bg-white p-3">
              {recording && <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500"/>Gravando áudio...
              </div>}
              <div className="flex items-end gap-2">
                <button
                  className={`btn ${recording ? "bg-red-600 text-white hover:bg-red-700" : "btn-soft"} shrink-0`}
                  onClick={recording ? stopRecording : () => void startRecording()}
                  disabled={sending}
                  title={recording ? "Parar e enviar áudio" : "Gravar áudio"}
                >
                  {recording ? <Square size={17}/> : <Mic size={17}/>}
                </button>
                <textarea
                  value={text}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendTextMessage();
                    }
                  }}
                  placeholder="Digite uma mensagem"
                  rows={1}
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-[#dfe7e1] bg-[#fbfcfb] px-3 py-2.5 text-sm outline-none focus:border-[#269451]"
                />
                <button className="btn btn-primary shrink-0" onClick={() => void sendTextMessage()} disabled={!text.trim() || sending}>
                  {sending ? <Loader2 size={17} className="animate-spin"/> : <Send size={17}/>}
                  <span className="max-[600px]:hidden">Enviar</span>
                </button>
              </div>
            </footer>
          </> : <div className="grid flex-1 place-items-center p-8 text-center text-[#718077]">
            <div>
              <MessageCircle size={42} className="mx-auto mb-3 text-[#83a08d]"/>
              <strong className="block text-base text-[#35483d]">Selecione uma conversa</strong>
              <span className="mt-1 block text-sm">As respostas serão enviadas pelo mesmo número que recebeu a mensagem.</span>
            </div>
          </div>}
        </div>
      </div>
    </section>
  </div>;
}
