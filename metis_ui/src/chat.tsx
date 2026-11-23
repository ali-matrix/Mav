"use client";
// @metis/ui — the Metis chat panel. Presentational: the app sends the question, reads the
// answer and drives its own page; this only lays the conversation out the same way in
// every dashboard. It docks on the right with NO scrim, so the page behind stays live while
// Metis takes the reader to a view. Opened from the rail's "Ask Metis" (Sidebar `onAsk`).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { MetisMark } from "./brand";

export type ChatMessage = {
  role: "user" | "metis";
  text: ReactNode;
  /** A second line under the answer (what Metis can do instead, for a question out of scope). */
  note?: ReactNode;
  /** `error`: the answer could not be had; `warn`: out of scope. Colours the edge, never alone. */
  tone?: "error" | "warn";
  /** Links the answer offers (a guide section, another dashboard). Open in a new tab. */
  links?: { label: string; href: string }[];
  /** "Taking you there": said when the answer moved the page. */
  moved?: string;
  /** Follow-up questions, offered under the newest answer only. */
  followups?: string[];
  /** v0.9: the answer as plain text; when given, a "Copy" action sits under it. */
  copy?: string;
};

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="mx-chat-copy" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function ChatPanel({ open, onClose, onReset, onAsk, messages, loading, slow, prompts,
  title = "Metis", sub = "MG Apparel's centre of excellence", intro, placeholder = "Ask Metis, e.g. which orders are at risk?" }: {
  open: boolean; onClose: () => void; onReset?: () => void; onAsk: (q: string) => void;
  messages: ChatMessage[]; loading?: boolean; slow?: boolean; prompts?: string[];
  title?: string; sub?: string; intro?: ReactNode; placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const pos = useRef(-1);

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [messages, loading, open]);
  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);

  if (!open) return null;
  const send = (raw: string) => {
    const q = raw.trim();
    if (!q || loading) return;
    history.current = [q, ...history.current.filter((h) => h !== q)].slice(0, 20);
    pos.current = -1;
    setInput("");
    onAsk(q);
  };
  const last = messages.map((m) => m.role).lastIndexOf("metis");

  return (
    <aside className="mx-chat mx-root" role="dialog" aria-label={`Ask ${title}`}>
      <header className="mx-chat-head">
        <MetisMark size={32} />
        <div className="mx-chat-name"><b>{title}</b><small>{sub}</small></div>
        {onReset && messages.length > 0 && (
          <button className="mx-btn" data-variant="ghost" data-size="sm" onClick={onReset} title="Start a new conversation">New chat</button>
        )}
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close the chat" title="Close"><Icon name="x" /></button>
      </header>

      <div className="mx-chat-body" ref={scroll} aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-chat-intro">
            <MetisMark size={56} />
            <p className="mx-chat-intro-title">Ask about anything on this dashboard</p>
            {intro && <p className="mx-chat-intro-sub">{intro}</p>}
            {!!prompts?.length && (
              <div className="mx-chat-prompts">
                {prompts.map((p) => <button key={p} onClick={() => send(p)}>{p}<Icon name="arrowRight" size={14} /></button>)}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="mx-chat-msg" data-role="user"><div className="mx-chat-bubble">{m.text}</div></div>
        ) : (
          <div key={i} className="mx-chat-msg" data-role="metis">
            <MetisMark size={22} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="mx-chat-bubble" data-tone={m.tone}>
                {m.text}
                {m.note && <p className="mx-chat-note">{m.note}</p>}
                {!!m.links?.length && (
                  <div className="mx-chat-links">
                    {m.links.map((l) => (
                      <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}<Icon name="external" size={12} /></a>
                    ))}
                  </div>
                )}
                {m.moved && <p className="mx-chat-moved"><Icon name="arrowRight" size={13} />{m.moved}</p>}
              </div>
              {m.copy && <CopyButton text={m.copy} />}
              {i === last && !loading && !!m.followups?.length && (
                <div className="mx-chat-follow">{m.followups.map((f) => <button key={f} onClick={() => send(f)}>{f}</button>)}</div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="mx-chat-msg" data-role="metis">
            <MetisMark size={22} />
            <div className="mx-chat-bubble mx-chat-wait">{slow ? "Still working it out. This one takes a little longer…" : "Working it out…"}</div>
          </div>
        )}
      </div>

      <form className="mx-chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input ref={field} className="mx-input" value={input} maxLength={1000} placeholder={placeholder} aria-label={`Ask ${title}`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {   // ↑ / ↓ walk back through what was asked
            const h = history.current;
            if (e.key === "ArrowUp" && h.length) { e.preventDefault(); pos.current = Math.min(pos.current + 1, h.length - 1); setInput(h[pos.current]); }
            else if (e.key === "ArrowDown" && pos.current >= 0) { e.preventDefault(); pos.current -= 1; setInput(pos.current >= 0 ? h[pos.current] : ""); }
          }} />
        <button type="submit" className="mx-btn" data-variant="primary" disabled={!input.trim() || loading} aria-label="Send">
          <Icon name="send" size={16} />
        </button>
      </form>
    </aside>
  );
}
