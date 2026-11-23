// @metis/ui — every dashboard's mark, the Metis mark and the "Powered by Metis" line.
// AppMark's drawings live in marks/*.svg (build with scripts/build-marks.mjs). MetisMark's
// parchment disc: Metis_DesignLanguage/branding/metis_avatar.svg.
import { MARK_ART, type AppMarkName } from "./marks";

const MARK_NAMES: Record<AppMarkName, string> = {
  acta: "Acta", agora: "Agora", argus: "Argus", chronos: "Chronos",
  production: "Production", saga: "Saga", stoa: "Stoa", tna: "Time & Action",
};

/** A dashboard's mark. White, in both themes, so it cuts through the header and rail.
 *  Anywhere else (a sign-in sheet, a pale card) pass `plate`: the same white mark on a
 *  brand-blue tile, which reads on any surface. */
export function AppMark({ app, size = 30, plate }: { app: AppMarkName; size?: number; plate?: boolean }) {
  const art = (s: number) => (
    <svg className="mx-mark" width={s} height={s} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={4}
      strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={MARK_NAMES[app]}
      dangerouslySetInnerHTML={{ __html: MARK_ART[app] }} />
  );
  if (!plate) return art(size);
  return <span className="mx-mark-plate" style={{ width: size, height: size }}>{art(Math.round(size * 0.72))}</span>;
}

/** The golden fibula bent into an M. `round`: parchment disc. `bare`: mark only, its
 *  bow in currentColor, for coloured surfaces such as the sidebar. */
export function MetisMark({ size = 24, variant = "round" }: { size?: number; variant?: "round" | "bare" }) {
  const ink = variant === "round" ? "#16384C" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Metis" style={{ flex: "none" }}>
      {variant === "round" && <circle cx="100" cy="100" r="100" fill="#F4EDDC" />}
      <path d="M44 140 L152 140" fill="none" stroke="#27AAE1" strokeWidth="7" strokeLinecap="round" />
      <path d="M44 132 L70 58 L100 122 L130 58 L156 132" fill="none" stroke={ink} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="37" cy="127" r="9.5" fill="none" stroke={ink} strokeWidth="8" />
      <path d="M31 135 C26 142 28 149 35 150" fill="none" stroke="#27AAE1" strokeWidth="4" strokeLinecap="round" />
      <rect x="146" y="116" width="15" height="32" rx="7" fill="#E4B54D" />
    </svg>
  );
}

/** The signature grown into the door to Metis's chat (owner, 2026-11-02): the mark at
 *  chat size, "Ask Metis", and the signature line under it. The Sidebar puts it at its
 *  foot when given `onAsk`; on a phone (no rail foot) the same mark floats above the tab bar. */
export function AskMetis({ onClick, open }: { onClick: () => void; open?: boolean }) {
  return (
    <>
      <button className="mx-ask" onClick={onClick} aria-expanded={open} aria-haspopup="dialog"
        title="Ask Metis: answers about this dashboard, and takes you to the right view">
        <MetisMark size={30} />
        <span className="mx-ask-words"><b>Ask Metis</b><small>Powered by Metis</small></span>
      </button>
      <button className="mx-ask-fab" onClick={onClick} aria-label="Ask Metis" aria-expanded={open} aria-haspopup="dialog">
        <MetisMark size={44} />
      </button>
    </>
  );
}

/** "Powered by Metis": the suite signature. Sits at the foot of the sidebar. */
export function PoweredByMetis() {
  return (
    <div className="mx-powered" title="Metis is MG Apparel's centre of excellence: it reads the ERP and works out every figure here.">
      <MetisMark size={18} />
      <span>Powered by Metis</span>
    </div>
  );
}
