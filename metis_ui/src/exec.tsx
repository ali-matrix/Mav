"use client";
// @metis/ui — the executive pieces (v0.3): what an executive reads in 20 seconds.
// Presentational only, like data.tsx: every figure and every sentence arrives worked
// out. The ten rules these serve are in README.md §Executive pieces:
//   outcomes first · every KPI has context · exceptions over normality · trends ·
//   whitespace · summary then detail · freshness shown · one colour language ·
//   numbers get a narrative · every warning leads somewhere.
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import type { Tone } from "./data";

const toneClass = (t?: Tone) => (t ? `mx-tone-${t}` : "");

// ── Delta: "↑ 8.2% vs last month" ───────────────────────────────────────────
/** A change against a stated basis. `tone` comes from an APPROVED direction (is up
 *  good for this measure?); with no approved direction leave it neutral. */
export function Delta({ dir, text, basis, tone = "neutral" }: {
  dir: "up" | "down" | "flat"; text: ReactNode; basis?: ReactNode; tone?: Tone;
}) {
  return (
    <span className="mx-delta">
      <b className={toneClass(tone)}><Icon name={dir === "up" ? "arrowUp" : dir === "down" ? "arrowDown" : "minus"} size={12} />{text}</b>
      {basis && <span>{basis}</span>}
    </span>
  );
}

// ── SyncStamp: "Last synced 10:24 · 28 Oct 2026" ────────────────────────────
/** Data freshness, always visible in the page header. The app decides the state from
 *  its own sync clock; the words say it, the dot repeats it. */
export function SyncStamp({ state, at, label = "Last synced", detail }: {
  state: "live" | "delayed" | "stopped"; at: string | number | Date | null | undefined; label?: string; detail?: ReactNode;
}) {
  const tone: Tone = state === "live" ? "ok" : state === "delayed" ? "warn" : "danger";
  const d = at ? new Date(at) : null;
  const when = d && !isNaN(+d)
    ? `${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : null;
  // Before the first read there is nothing to judge: say only that it is being checked.
  if (!when) return <span className="mx-sync mx-tone-neutral"><em>Checking</em></span>;
  return (
    <span className={`mx-sync ${toneClass(tone)}`} title={typeof detail === "string" ? detail : undefined}>
      <em>{state === "live" ? "Live" : state === "delayed" ? "Delayed" : "Not live"}</em>
      <span>{label} <b className="mx-num">{when}</b></span>
    </span>
  );
}

// ── HealthList: "Business health" — one line per area, a word not just a dot ──
export type HealthRow = { key: string; label: ReactNode; tone: Tone; word: string; detail?: ReactNode; icon?: IconName; onClick?: () => void };
export function HealthList({ rows }: { rows: HealthRow[] }) {
  return (
    <ul className="mx-health">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="mx-health-label">{r.label}{r.detail && <small>{r.detail}</small>}</span>
            <span className={`mx-health-word ${toneClass(r.tone)}`}>{r.word}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? <button onClick={r.onClick}>{inner}<Icon name="chevronRight" size={14} className="mx-health-go" /></button> : <div>{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

// ── AlertList: the exceptions — largest first, each opens what it is about ───
export type AlertRow = {
  key: string; tone: Tone; icon: IconName; title: ReactNode; detail?: ReactNode;
  /** `count` is kept for callers; the title already says how many. `action` is the row's tooltip. */
  count?: ReactNode; onClick?: () => void; action?: string;
};
export function AlertList({ rows, empty }: { rows: AlertRow[]; empty?: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <ul className="mx-alerts">
      {rows.map((a) => {
        const inner = (
          <>
            <span className={`mx-alert-icon ${toneClass(a.tone)}`}><Icon name={a.icon} size={16} /></span>
            <span className={`mx-alert-text ${toneClass(a.tone)}`}>
              <b>{a.title}</b>
              {a.detail && <small>{a.detail}</small>}
            </span>
            {a.onClick && <Icon name="chevronRight" size={14} className="mx-alert-go" />}
          </>
        );
        return <li key={a.key}>{a.onClick ? <button onClick={a.onClick} title={a.action}>{inner}</button> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

// ── InsightPanel: the numbers told as a story, in a few numbered lines ───────
export type Insight = { key: string; title: ReactNode; body: ReactNode; tone?: Tone; onClick?: () => void };
/** The deterministic read of the page: each line is built from figures on it, never
 *  invented. `signature` names who worked it out and when (e.g. "Worked out by Metis · 10:24"). */
export function InsightPanel({ title, lead, items, signature, art }: {
  title: ReactNode; lead?: ReactNode; items: Insight[]; signature?: ReactNode; art?: ReactNode;
}) {
  return (
    <section className="mx-insight">
      <header>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      <div className="mx-insight-body">
        <ol>
          {items.map((it) => {
            const inner = (
              <>
                <span><b>{it.title}</b><small>{it.body}</small></span>
                {it.onClick && <Icon name="chevronRight" size={15} className="mx-insight-go" />}
              </>
            );
            return <li key={it.key}>{it.onClick ? <button onClick={it.onClick}>{inner}</button> : <div>{inner}</div>}</li>;
          })}
        </ol>
        {art && <div className="mx-insight-art" aria-hidden>{art}</div>}
      </div>
      {signature && <footer>{signature}</footer>}
    </section>
  );
}

// ── Ring: one share, with what makes up the rest beside it ───────────────────
export type RingPart = { key: string; label: ReactNode; value: number; display: ReactNode; tone: Tone };
/** A donut of parts that add up to a whole, its headline share in the middle. Always
 *  with its legend: the ring is never the only place a figure appears. */
export function Ring({ parts, center, caption, size = 132, label }: {
  parts: RingPart[]; center: ReactNode; caption?: ReactNode; size?: number; label: string;
}) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  const r = 42, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="mx-ring">
      <div className="mx-ring-fig" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--mx-ring-track)" strokeWidth="10" />
          {parts.map((p) => {
            const len = (Math.max(0, p.value) / total) * c;
            const el = (
              <circle key={p.key} className={toneClass(p.tone)} cx="50" cy="50" r={r} fill="none" stroke="var(--tone)"
                strokeWidth="10" strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`} strokeDashoffset={-acc}
                transform="rotate(-90 50 50)" strokeLinecap="butt" />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="mx-ring-center">{center}</div>
      </div>
      <ul className="mx-ring-legend">
        {parts.map((p) => (
          <li key={p.key}><i className={toneClass(p.tone)} aria-hidden /><span>{p.label}</span><b className="mx-num">{p.display}</b></li>
        ))}
        {caption && <li className="mx-ring-caption">{caption}</li>}
      </ul>
    </div>
  );
}

// ── StackBar: one whole split into parts on a single line (aging, placement) ──
export function StackBar({ parts, label, height = 12 }: { parts: RingPart[]; label: string; height?: number }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="mx-stack">
      <div className="mx-stack-bar" role="img" aria-label={label} style={{ height }}>
        {parts.map((p) => {
          const pct = (100 * Math.max(0, p.value)) / total;
          return pct > 0 ? <i key={p.key} className={toneClass(p.tone)} style={{ width: `${pct}%` }} title={`${typeof p.label === "string" ? p.label : ""}: ${typeof p.display === "string" ? p.display : ""}`} /> : null;
        })}
      </div>
      <ul className="mx-stack-legend">
        {parts.map((p) => (
          <li key={p.key}><i className={toneClass(p.tone)} aria-hidden /><span>{p.label}</span><b className="mx-num">{p.display}</b></li>
        ))}
      </ul>
    </div>
  );
}

// ── FlowSteps: a pipeline read left to right ("came in → stored → issued") ───
export type FlowStep = { key: string; label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void };
export function FlowSteps({ steps, label }: { steps: FlowStep[]; label: string }) {
  return (
    <ol className="mx-flow" aria-label={label}>
      {steps.map((s) => {
        const inner = (
          <>
            <span className="mx-flow-label">{s.label}</span>
            <b className="mx-flow-value mx-num">{s.value}</b>
            {s.sub && <small>{s.sub}</small>}
          </>
        );
        return (
          <li key={s.key}>
            {s.onClick ? <button onClick={s.onClick}>{inner}</button> : <div>{inner}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ── QuickActions: where to go next, as plain verbs ───────────────────────────
export function QuickActions({ items }: { items: { key: string; label: string; icon?: IconName; onClick: () => void }[] }) {
  return (
    <div className="mx-quick">
      {items.map((it) => (
        <button key={it.key} onClick={it.onClick}>
          {it.icon && <Icon name={it.icon} size={16} />}<span>{it.label}</span><Icon name="arrowRight" size={14} className="mx-quick-go" />
        </button>
      ))}
    </div>
  );
}
