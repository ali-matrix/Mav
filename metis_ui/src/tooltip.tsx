"use client";
// @metis/ui — the one tooltip. Mount <TooltipLayer /> once in the shell: it takes over
// every `title` attribute (the browser's plain black-and-white box never shows) and every
// `data-tip`, on hover AND keyboard focus. One listener for the whole page, no per-element
// cost. Optional `data-tip-head` adds a bold first line. Text keeps its line breaks.
import { useEffect, useRef, useState } from "react";

type Tip = { head?: string; body: string; x: number; y: number; below: boolean };
const SEL = "[data-tip],[title]";

function take(el: HTMLElement): { head?: string; body: string } | null {
  const t = el.getAttribute("title");
  if (t) {
    el.dataset.tip = t;
    el.removeAttribute("title");                       // the native box never appears
    if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", t);
  }
  const body = el.dataset.tip;
  return body ? { head: el.dataset.tipHead, body } : null;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => { if (timer.current) clearTimeout(timer.current); current.current = null; setTip(null); };
    const show = (el: HTMLElement, delay: number) => {
      const c = take(el);
      if (!c) return;
      current.current = el;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 90;
        setTip({ ...c, x: Math.round(r.left + r.width / 2), y: Math.round(below ? r.bottom + 10 : r.top - 10), below });
      }, delay);
    };
    const over = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
      if (!el) return;
      if (el !== current.current) show(el, 220);
    };
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (current.current && to && current.current.contains(to)) return;
      hide();
    };
    const focus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
      if (el && (e.target as HTMLElement).matches(":focus-visible")) show(el, 0);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out as EventListener);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", key);
    addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out as EventListener);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", key);
      removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className="mx-tip" role="tooltip" data-below={tip.below || undefined}
      style={{ left: `clamp(150px, ${tip.x}px, calc(100vw - 150px))`, top: tip.y }}>
      {tip.head && <b>{tip.head}</b>}
      <span>{tip.body}</span>
    </div>
  );
}
