"use client";
// @metis/ui — light charts in plain SVG (no chart library on the first load).
// For one time-series question. Heavier needs (zoom, many series) may use the app's
// own library, styled with the --mx-series-* tokens so colours stay one system.
// v0.4: drawn once and still. v0.9: solid lines and columns only, no wash or gradient (owner).
// v0.7.3: always lines (owner). Under a week of points each day also wears a dot, so a short
// line still shows where its days are.
import { useState, type ReactNode } from "react";

export type Series = { key: string; label: string; values: number[]; color?: string; area?: boolean; dashed?: boolean };

/** Lines over time with a hover rule + tooltip, a legend, and a hidden text summary. */
export function TrendChart({ labels, series, height = 200, format = (n) => String(n), summary, axis = true }: {
  labels: string[]; series: Series[]; height?: number; format?: (n: number) => string; summary: string; axis?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 4, R = 4, T = 10, B = 4;
  const n = labels.length;
  const few = n < 7;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const col = (s: Series, i: number) => s.color ?? `var(--mx-series-${(i % 6) + 1})`;
  const step = Math.max(1, Math.ceil(n / 6));
  // Even steps counted back from the last day, so the final label never collides.
  const ticks = [...Array(n).keys()].filter((i) => (n - 1 - i) % step === 0);
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width * W - L) / (W - L - R) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <figure style={{ margin: 0 }}>
      <div className="mx-chart-legend" aria-hidden>
        {series.map((s, i) => (
          <span key={s.key}>
            <i style={{ background: col(s, i) }} />{s.label}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: axis ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)", columnGap: 10 }}>
        {axis && (
          <div className="mx-axis" style={{ height: H, paddingTop: T - 6, paddingBottom: B }} aria-hidden>
            {[1, 0.5, 0].map((f) => <span key={f}>{format(max * f)}</span>)}
          </div>
        )}
        <div style={{ position: "relative", minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={summary}
            style={{ display: "block", overflow: "visible" }}
            onMouseMove={(e) => pick(e.clientX, e.currentTarget)} onMouseLeave={() => setHover(null)}
            onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget)}>
            {[0.5, 1].map((f) => (
              <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--mx-border)" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--mx-border-strong)" vectorEffect="non-scaling-stroke" />
            {series.map((s, i) => {
              const d = s.values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
              return (
                <g key={s.key}>
                  <path d={d} fill="none" stroke={col(s, i)}
                    strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
                    strokeDasharray={s.dashed ? "4 4" : undefined} />
                </g>
              );
            })}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke="var(--mx-text-3)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* Hover dots in HTML so they stay round on a stretched chart. */}
          {few && series.map((s, i) => s.values.map((v, k) => (
            <i key={`${s.key}-${k}`} className="mx-chart-dot" style={{ left: `${(x(k) / W) * 100}%`, top: y(v ?? 0), borderColor: col(s, i) }} />
          )))}
          {hover !== null && series.map((s, i) => (
            <i key={s.key} className="mx-chart-dot" style={{ left: `${(x(hover) / W) * 100}%`, top: y(s.values[hover] ?? 0), borderColor: col(s, i) }} />
          ))}
          <div className="mx-xaxis" aria-hidden>
            {ticks.map((i) => (
              <span key={i} style={{ left: `${(x(i) / W) * 100}%`, transform: i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{labels[i]}</span>
            ))}
          </div>
          {hover !== null && (
            <div role="status" className="mx-chart-tip" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 95px), calc(100% - 190px))` }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{labels[hover]}</div>
              {series.map((s, i) => (
                <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: "var(--mx-text-2)" }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: col(s, i), marginRight: 6 }} />{s.label}</span>
                  <b className="mx-num">{format(s.values[hover] ?? 0)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className="mx-sr">{summary}</figcaption>
    </figure>
  );
}

/** A round axis top just above the largest value, so the line uses the chart's height. */
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Columns for a handful of categories or periods (months, aging buckets). A bar may
 *  open its own detail. */
export function ColumnChart({ bars, height = 180, format = (n) => String(n), summary }: {
  bars: { key: string; label: string; value: number; tone?: string; onClick?: () => void; note?: string }[];
  height?: number; format?: (n: number) => string; summary: string;
}) {
  const max = niceMax(Math.max(1, ...bars.map((b) => b.value)));
  // v0.9: past eight columns the figures would collide; each stays in its tooltip.
  const dense = bars.length > 8;
  return (
    <figure style={{ margin: 0 }}>
      <div className="mx-cols" data-dense={dense || undefined} style={{ height }} role="img" aria-label={summary}>
        {bars.map((b) => {
          const inner = (
            <>
              {!dense && <span className="mx-col-val mx-num">{format(b.value)}</span>}
              <span className="mx-col-track"><i style={{ height: `${Math.max(1.5, (100 * b.value) / max)}%`, background: b.tone ?? "var(--mx-series-1)" }} /></span>
              <span className="mx-col-label">{b.label}</span>
            </>
          );
          const tip = b.note ?? `${b.label}: ${format(b.value)}`;
          return b.onClick
            ? <button key={b.key} className="mx-col" onClick={b.onClick} data-tip={tip} title={tip}>{inner}</button>
            : <div key={b.key} className="mx-col" data-tip={tip} title={tip}>{inner}</div>;
        })}
      </div>
      <figcaption className="mx-sr">{summary}</figcaption>
    </figure>
  );
}

/** Label + value pairs in a tight grid: the "what makes up this number" under a chart. */
export function StatRow({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="mx-statrow" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} style={{ minWidth: 0 }}>
          <dt>{it.label}</dt>
          <dd className="mx-num">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
