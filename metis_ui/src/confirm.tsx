"use client";
// @metis/ui — a confirmation for an irreversible action, in the kit's look (never the
// browser's confirm() box). `const [ask, dialog] = useConfirm();` render {dialog};
// `if (await ask({ title, body, ok: "Remove", danger: true })) …`.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

type Ask = { title: string; body?: ReactNode; ok: string; danger?: boolean };

export function useConfirm(): [(q: Ask) => Promise<boolean>, ReactNode] {
  const [q, setQ] = useState<(Ask & { done: (v: boolean) => void }) | null>(null);
  const ask = useCallback((a: Ask) => new Promise<boolean>((done) => setQ({ ...a, done })), []);
  const close = (v: boolean) => { q?.done(v); setQ(null); };
  return [ask, q ? <ConfirmDialog key="c" {...q} onAnswer={close} /> : null];
}

function ConfirmDialog({ title, body, ok, danger, onAnswer }: Ask & { onAnswer: (v: boolean) => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    okRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onAnswer(false); };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); back?.focus?.(); };
  }, [onAnswer]);
  return (
    <>
      <div className="mx-scrim" onClick={() => onAnswer(false)} />
      <div className="mx-root mx-confirm" role="alertdialog" aria-modal="true" aria-label={title}>
        <span className={`mx-kpi-icon ${danger ? "mx-tone-danger" : "mx-tone-brand"}`} style={{ width: 40, height: 40 }}>
          <Icon name={danger ? "alert" : "help"} size={20} />
        </span>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
        <div className="mx-confirm-actions">
          <button className="mx-btn" onClick={() => onAnswer(false)}>Cancel</button>
          <button ref={okRef} className="mx-btn" data-variant={danger ? "danger" : "primary"} onClick={() => onAnswer(true)}>{ok}</button>
        </div>
      </div>
    </>
  );
}
