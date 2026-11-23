"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@metis/ui";

export default function CenteredModal({ title, sub, onClose, children, width, headerActions }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; width: number; headerActions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    ref.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <>
      <div className="mx-scrim" onClick={onClose} />
      <div
        className="mx-root centered-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      >
        <div className="centered-modal-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{title}</h2>
            {sub && <p className="mx-card-sub">{sub}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--mx-2)", flexShrink: 0 }}>
            {headerActions}
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="centered-modal-body">{children}</div>
      </div>
    </>
  );
}
