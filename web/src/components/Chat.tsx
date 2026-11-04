"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";

const POLL_MS = 3000;

export default function Chat({ houseId, meId, names }: { houseId: string; meId: string; names: Record<string, string> }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const last = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ houseId });
    if (last.current) q.set("after", last.current);
    const res = await fetch(`/api/messages?${q}`, { cache: "no-store" });
    if (!res.ok) return;
    const { messages: incoming } = (await res.json()) as { messages: ChatMessage[] };
    setMsgs((cur) => {
      const merged = mergeMessages(cur ?? [], incoming);
      last.current = merged.at(-1)?.createdAt ?? last.current;
      return merged;
    });
  }, [houseId]);

  useEffect(() => {
    load();
    // polling simple: pausa mientras la pestaña está oculta
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [msgs?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setMsgs((cur) => {
        const merged = mergeMessages(cur ?? [], [data.message]);
        last.current = merged.at(-1)?.createdAt ?? last.current;
        return merged;
      });
      setText("");
    } catch (er) {
      setError(er instanceof Error ? er.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" aria-live="polite">
        {msgs === null && <p className="text-sm text-zinc-500">Cargando…</p>}
        {msgs?.length === 0 && <p className="text-sm text-zinc-500">Todavía no hay mensajes. Escribí el primero.</p>}
        {msgs?.map((m) => {
          const mine = m.authorId === meId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="text-xs text-zinc-500">
                {mine ? "Vos" : names[m.authorId] ?? "?"} · {new Date(m.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${mine ? "bg-emerald-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                {m.body}
              </span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Escribí un mensaje a la casa"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button disabled={sending || !text.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          Enviar
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
