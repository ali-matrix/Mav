"use client";
// @metis/ui — data display. Presentational only: every figure arrives computed (the
// brain does the maths); these components never derive a business number.
import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** Verdicts best to worst: ok → fair → warn → severe → danger. info, neutral, brand are not verdicts. */
export type Tone = "ok" | "fair" | "warn" | "severe" | "danger" | "info" | "neutral" | "brand";
const toneClass = (t?: Tone) => (t ? `mx-tone-${t}` : "");
/** `data-*` hooks an app needs on a piece itself (a navigation target id, a test hook). */
export type DataAttrs = Record<`data-${string}`, string>;

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ title, sub, actions, children, flush, className = "", style, data }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
  style?: React.CSSProperties; data?: DataAttrs;
}) {
  return (
    <section className={`mx-card ${className}`} style={style} {...data}>
      {(title || actions) && (
        <div className="mx-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="mx-card-title">{title}</h2>}
            {sub && <p className="mx-card-sub">{sub}</p>}
          </div>
          {actions && <div className="mx-card-actions">{actions}</div>}
        </div>
      )}
      <div className="mx-card-body" data-flush={flush || undefined}>{children}</div>
    </section>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────
/** A KPI is an entry point, not a number tile: label, value + unit, the comparison
 *  that gives it meaning, optional trend. Pass `onClick` ONLY when a real filtered
 *  view exists; then it is a button with a pressed state. `delta.tone` must come from
 *  an approved direction (is higher good?), never guessed here. */
export function KpiCard({ label, value, unit, tone = "brand", foot, delta, spark, onClick, selected, art, context, share, status, lead, figureTone, data }: {
  label: ReactNode; value: ReactNode; unit?: string; icon?: IconName; tone?: Tone; foot?: ReactNode;
  delta?: { text: string; dir: "up" | "down" | "flat"; tone?: Tone; basis?: string }; spark?: number[];
  onClick?: () => void; selected?: boolean; art?: ReactNode;
  /** v0.3: context rows under the number ("Came in · Rs 4.1M"). Never a made-up target. */
  context?: { label: ReactNode; value: ReactNode; tone?: Tone }[];
  /** v0.3: a share of a stated whole, a thin meter with its words. */
  share?: { pct: number; label: ReactNode; tone?: Tone };
  /** The verdict from an approved rule only: its word in the corner and, since v0.6, the
   *  figure itself in the same colour when the verdict is warn, severe or danger (v0.7.1). */
  status?: { tone: Tone; word: string };
  /** v0.7: the band's lead figure: a larger number and twice the share of the row. */
  lead?: boolean;
  /** v0.7.2: the figure's own colour, when the page decides it ("ink" keeps it plain even
   *  with a bad verdict word). Unset: the verdict colours it when warn, severe or danger. */
  figureTone?: Tone | "ink";
  data?: DataAttrs;
}) {
  const ft = figureTone === "ink" ? undefined
    : figureTone ?? (status && (status.tone === "warn" || status.tone === "severe" || status.tone === "danger") ? status.tone : undefined);
  const body = (
    <>
      <div className="mx-kpi-top">
        <span className="mx-kpi-name">
          <span className="mx-kpi-label">{label}</span>
          {onClick && <Icon name="chevronRight" size={14} className="mx-kpi-go" />}
        </span>
        {status && <span className={`mx-badge ${toneClass(status.tone)}`}>{status.word}</span>}
        {art && <span style={{ marginLeft: status ? 8 : "auto" }} aria-hidden>{art}</span>}
      </div>
      <div className={ft ? `mx-kpi-value mx-kpi-toned ${toneClass(ft)}` : "mx-kpi-value"}>{value}{unit && <span className="mx-kpi-unit">{unit}</span>}</div>
      <div className="mx-kpi-foot">
        {delta && (
          <span className={`mx-kpi-delta ${toneClass(delta.tone ?? "neutral")}`} style={{ color: "var(--tone)" }}>
            <Icon name={delta.dir === "up" ? "arrowUp" : delta.dir === "down" ? "arrowDown" : "minus"} size={13} />{delta.text}
          </span>
        )}
        {delta?.basis && <span>{delta.basis}</span>}
        {foot}
      </div>
      {share && (
        <div className="mx-kpi-share">
          <Meter pct={share.pct} tone={share.tone ?? tone} />
          <span>{share.label}</span>
        </div>
      )}
      {context && context.length > 0 && (
        <dl className="mx-kpi-context">
          {context.map((c, i) => (
            <div key={i}><dt>{c.label}</dt><dd className={`mx-num ${toneClass(c.tone)}`} style={c.tone ? { color: "var(--tone)" } : undefined}>{c.value}</dd></div>
          ))}
        </dl>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} tone={tone} className="mx-kpi-spark" />}
    </>
  );
  const cls = lead ? "mx-kpi mx-kpi-lead" : "mx-kpi";
  return onClick
    ? <button className={cls} onClick={onClick} aria-pressed={selected ?? undefined} {...data}>{body}</button>
    : <div className={cls} {...data}>{body}</div>;
}

export function KpiGrid({ children, min = 210 }: { children: ReactNode; min?: number }) {
  return <div className="mx-kpis" style={{ ["--kpi-min" as string]: `${min}px` }}>{children}</div>;
}

// ── Sparkline (SVG, no chart library) ────────────────────────────────────────
export function Sparkline({ values, tone = "brand", className, height = 46 }: { values: number[]; tone?: Tone; className?: string; height?: number }) {
  const w = 100, h = height, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 10)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  return (
    <svg className={`mx-spark ${className ?? ""} ${toneClass(tone)}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={line} fill="none" stroke="var(--tone)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// ── Meter + bar list (category ranking = horizontal bars) ────────────────────
export function Meter({ pct, tone = "brand", label }: { pct: number; tone?: Tone; label?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={`mx-meter ${toneClass(tone)}`} role="meter" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${p}%` }} />
    </span>
  );
}

export type BarRow = { key: string; label: ReactNode; value: number; display: ReactNode; tone?: Tone; onClick?: () => void; title?: string };
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="mx-barlist">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="mx-barlist-label">{r.label}</span>
            <span className="mx-barlist-value">{r.display}</span>
            <Meter pct={(100 * r.value) / top} tone={r.tone ?? "brand"} />
          </>
        );
        return r.onClick
          ? <button key={r.key} className="mx-barlist-row" onClick={r.onClick} title={r.title}>{inner}</button>
          : <div key={r.key} className="mx-barlist-row" title={r.title}>{inner}</div>;
      })}
    </div>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────
export function StatusBadge({ tone, children, plain }: { tone: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`mx-badge ${toneClass(tone)}`} data-plain={plain || undefined}>{children}</span>;
}

export function Banner({ tone, icon = "info", children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return <div className={`mx-banner ${toneClass(tone)}`} role="status"><Icon name={icon} />{<div>{children}</div>}</div>;
}

/** "Updated 09:42" with a live / delayed / not-live dot. The app decides which; the words say it. */
export function Freshness({ state, children }: { state: "live" | "delayed" | "stopped"; children: ReactNode }) {
  const tone: Tone = state === "live" ? "ok" : state === "delayed" ? "warn" : "danger";
  return <span className={`mx-fresh ${toneClass(tone)}`}>{children}</span>;
}

// ── Table ────────────────────────────────────────────────────────────────────
export type Column<R> = {
  key: string; label: string; num?: boolean; sortable?: boolean; width?: number | string;
  render: (r: R) => ReactNode;
};
export function DataTable<R>({ columns, rows, rowKey, onRow, sort, onSort, empty, caption, minWidth }: {
  columns: Column<R>[]; rows: R[]; rowKey: (r: R) => string; onRow?: (r: R) => void;
  sort?: { key: string; dir: "asc" | "desc" }; onSort?: (key: string) => void; empty?: ReactNode; caption?: string; minWidth?: number;
}) {
  return (
    <div className="mx-table-wrap">
      <table className="mx-table" style={{ minWidth }}>
        {caption && <caption className="mx-sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th key={c.key} data-num={c.num || undefined} style={{ width: c.width }}
                  aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortable && onSort ? (
                    <button onClick={() => onSort(c.key)}>{c.label}
                      <Icon name={on ? (sort!.dir === "asc" ? "arrowUp" : "arrowDown") : "chevronDown"} size={12} style={{ opacity: on ? 1 : 0.35 }} />
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} data-click={onRow ? true : undefined} onClick={onRow ? () => onRow(r) : undefined}
              tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(r); } : undefined}>
              {columns.map((c) => <td key={c.key} data-num={c.num || undefined}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && empty}
    </div>
  );
}

// ── Drawer (quick record inspection; keeps the page behind it) ───────────────
export function Drawer({ title, sub, onClose, children, width }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); back?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="mx-scrim" onClick={onClose} />
      <div className="mx-drawer mx-root" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        ref={ref} tabIndex={-1} style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
        <div className="mx-drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{title}</h2>
            {sub && <p className="mx-card-sub">{sub}</p>}
          </div>
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="mx-drawer-body">{children}</div>
      </div>
    </>
  );
}

// ── States: every data view has all eight, and they never look alike ─────────
export type StateKind = "loading" | "empty" | "no-results" | "error" | "partial" | "stale" | "restricted";
const STATE_ICON: Record<Exclude<StateKind, "loading">, IconName> = {
  empty: "inbox", "no-results": "filter", error: "alert", partial: "info", stale: "clock", restricted: "shield",
};
export function StateView({ kind, title, children, action, art }: {
  kind: StateKind; title?: string; children?: ReactNode; action?: ReactNode; art?: ReactNode;
}) {
  if (kind === "loading") {
    return <div aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: 10, padding: 16 }}>
      {[0, 1, 2].map((i) => <div key={i} className="mx-skel" style={{ height: 18, width: `${92 - i * 18}%` }} />)}
    </div>;
  }
  const tone: Tone = kind === "error" ? "danger" : kind === "stale" || kind === "partial" ? "warn" : kind === "restricted" ? "neutral" : "brand";
  return (
    <div className={`mx-state ${toneClass(tone)}`} role={kind === "error" ? "alert" : "status"}>
      {art ? <div className="mx-state-art">{art}</div> : <Icon name={STATE_ICON[kind]} size={24} className="mx-state-icon" />}
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 18, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="mx-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}
