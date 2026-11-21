"use client";
// @metis/ui — the application shell: MG-blue rail + topbar + page header.
// The rail only renders what it is given: an app passes ONLY the pages the signed-in
// person may open (the server enforces the same rule; hiding is not access control).
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { TooltipLayer } from "./tooltip";
import { AskMetis, PoweredByMetis } from "./brand";

/** `href`: the entry leaves this app's pages (another dashboard, a PDF) and is a real link;
 *  `external` opens it in a new tab. Without `href` the entry calls `onSelect`. */
export type NavItem = { key: string; label: string; icon: IconName; badge?: number; hint?: string; href?: string; external?: boolean;
  /** `data-*` hooks the app needs on the entry itself (e.g. a navigation target id). */
  data?: Record<`data-${string}`, string> };
export type NavGroup = { label: string; items: NavItem[] };

export function AppShell({ rail, topbar, children, storageKey = "mx-rail" }: {
  rail: (collapsed: boolean, toggle: () => void) => ReactNode; topbar: ReactNode; children: ReactNode; storageKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem(storageKey) === "1"); } catch { /* none */ } }, [storageKey]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(storageKey, c ? "0" : "1"); } catch { /* none */ } return !c; });
  return (
    <div className="mx-root mx-shell" data-collapsed={collapsed}
      style={{
        "--mx-shell-cols": collapsed ? "68px" : "var(--mx-rail-w)",
        transition: "grid-template-columns 1000ms cubic-bezier(0.32, 0.72, 0, 1)",
      } as CSSProperties}>
      {collapsed && (
        <button className="mx-rail-reopen" onClick={toggle} aria-label="Show navigation" title="Show navigation">
          <Icon name="panelOpen" size={17} />
        </button>
      )}
      {rail(collapsed, toggle)}
      <div className="mx-main">
        {topbar}
        <main className="mx-content" id="main">{children}</main>
      </div>
      <TooltipLayer />
    </div>
  );
}

/** `mark`: the dashboard's own `<AppMark>`, never the company logo recoloured. Every rail
 *  ends with "Powered by Metis". */
export function Sidebar({ mark, app, sub, groups, active, onSelect, footer, collapsed, onToggle, onAsk, asking }: {
  mark: ReactNode; app: string; sub?: string; groups: NavGroup[]; active: string; onSelect: (key: string) => void;
  footer?: ReactNode; collapsed?: boolean; onToggle?: () => void;
  /** Opens Metis's chat; the signature becomes the "Ask Metis" button. `asking`: it is open. */
  onAsk?: () => void; asking?: boolean;
}) {
  return (
    <aside className="mx-rail" aria-label="Main navigation"
      style={{
        transform: "translateX(0)",
        visibility: "visible",
        pointerEvents: "auto",
        transition: "transform 1000ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}>
      <div className="mx-rail-brand">
        {onToggle && (
          <button className="mx-rail-toggle" onClick={onToggle} aria-label="Hide navigation"
            title="Hide navigation" aria-expanded={!collapsed}>
            <Icon name={collapsed ? "panelOpen" : "panelClose"} size={17} />
          </button>
        )}
        <span className="mx-rail-mark">{mark}</span>
        <div className="mx-rail-app">{app}{sub && <small>{sub}</small>}</div>
      </div>
      <nav className="mx-rail-nav">
        {groups.filter((g) => g.items.length).map((g) => (
          <div className="mx-rail-group" key={g.label} role="group" aria-label={g.label}>
            <div className="mx-rail-label">{g.label}</div>
            {g.items.map((it) => {
              const inner = (
                <>
                  <Icon name={it.icon} size={17} />
                  <span className="mx-rail-text">{it.label}</span>
                  {!!it.badge && <span className="mx-rail-badge mx-num" aria-label={`${it.badge} waiting`}>{it.badge > 99 ? "99+" : it.badge}</span>}
                  {it.href && it.external && <Icon name="external" size={13} className="mx-rail-ext" />}
                </>
              );
              const title = collapsed ? it.label : it.hint;
              return it.href ? (
                <a key={it.key} className="mx-rail-item" href={it.href} title={title} {...it.data}
                  {...(it.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{inner}</a>
              ) : (
                <button key={it.key} className="mx-rail-item" aria-current={active === it.key ? "page" : undefined}
                  onClick={() => onSelect(it.key)} title={title} {...it.data}>{inner}</button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mx-rail-foot">
        {footer}
        {onAsk ? <AskMetis onClick={onAsk} open={asking} /> : <PoweredByMetis />}
      </div>
    </aside>
  );
}

export function Topbar({ brand, search, children }: { brand?: ReactNode; search?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mx-topbar">
      {brand && <div className="mx-topbar-brand">{brand}</div>}
      {search && <div className="mx-topbar-search">{search}</div>}
      <div className="mx-topbar-right">{children}</div>
    </header>
  );
}

/** What page am I on and what it tells me, on ONE line (title left, description right);
 *  what I can do here (`aside`: filters, buttons) on the row below, never beside the words. */
export function PageHeader({ title, description, aside, art }: {
  title: string; description?: ReactNode; aside?: ReactNode; art?: ReactNode;
}) {
  return (
    <div className="mx-page-head">
      <div className="mx-page-head-row">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {art && <div className="mx-page-head-art" aria-hidden>{art}</div>}
      </div>
      {aside && <div className="mx-page-head-aside">{aside}</div>}
    </div>
  );
}
