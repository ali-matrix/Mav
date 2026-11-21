"use client";
// @metis/ui — controls: buttons, the segmented toggle, select, switch, search, filter chips.
// Every control has a visible label or an accessible name; none relies on colour alone.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Button({ variant = "secondary", size = "md", icon, children, ...rest }: {
  variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; icon?: IconName; children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="mx-btn" data-variant={variant} data-size={size} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}{children}
    </button>
  );
}

export function IconButton({ icon, label, dot, ...rest }: { icon: IconName; label: string; dot?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="mx-icon-btn" aria-label={label} title={label} data-dot={dot || undefined} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export type Option<K extends string = string> = { key: K; label: string; hint?: string };

/** A small set of mutually exclusive choices (2–5). More than that → Select. */
export function Segmented<K extends string>({ value, options, onChange, label }: {
  value: K; options: Option<K>[]; onChange: (k: K) => void; label: string;
}) {
  return (
    <div className="mx-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.key} aria-pressed={o.key === value} onClick={() => onChange(o.key)} title={o.hint}>{o.label}</button>
      ))}
    </div>
  );
}

export function Select<K extends string>({ value, options, onChange, label, hideLabel }: {
  value: K; options: Option<K>[]; onChange: (k: K) => void; label: string; hideLabel?: boolean;
}) {
  return (
    <label className="mx-field">
      <span className={hideLabel ? "mx-sr" : undefined}>{label}</span>
      <select className="mx-select" value={value} onChange={(e) => onChange(e.target.value as K)}>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} className="mx-switch" onClick={() => onChange(!checked)}>
      <i />{label}
    </button>
  );
}

/** A search box with a visible example of what can be searched. */
export function SearchField({ value, onChange, onSubmit, placeholder, label, shortcut }: {
  value: string; onChange: (v: string) => void; onSubmit?: (v: string) => void; placeholder: string; label: string; shortcut?: string;
}) {
  return (
    <form className="mx-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit?.(value.trim()); }}>
      <Icon name="search" size={17} />
      <input className="mx-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      {shortcut && !value && <kbd aria-hidden>{shortcut}</kbd>}
    </form>
  );
}

/** Applied filters, each removable, plus clear-all. Renders nothing when none apply. */
export function FilterChips({ chips, onClear }: { chips: { key: string; label: string; onRemove: () => void }[]; onClear?: () => void }) {
  if (!chips.length) return null;
  return (
    <div className="mx-chips" aria-label="Filters applied">
      {chips.map((c) => (
        <span className="mx-chip" key={c.key}>{c.label}
          <button onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}><Icon name="x" size={13} /></button>
        </span>
      ))}
      {onClear && chips.length > 1 && <Button variant="ghost" size="sm" onClick={onClear}>Clear all</Button>}
    </div>
  );
}

/** A scope or filter that opens a menu (period, customers, stores): the button says what
 *  is chosen, wears `data-on` while it narrows the page, and offers × to clear it. The menu
 *  is the kit's popover (`.mx-pop*` classes inside), never the browser's own list; it
 *  closes on a click outside or Escape. `children` gets `close` for a choice that ends it. */
export function MenuButton({ icon, label, on, onClear, clearLabel = "Clear", width = 260, title, children }: {
  icon: IconName; label: ReactNode; on?: boolean; onClear?: () => void; clearLabel?: string; width?: number; title?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("mousedown", away); addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", away); removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="mx-menu" ref={box}>
      <button type="button" className="mx-btn" data-on={on || undefined} aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} title={title}>
        <Icon name={icon} size={15} />
        <span className="mx-menu-label">{label}</span>
        {on && onClear ? (
          <span role="button" tabIndex={0} className="mx-menu-clear" aria-label={clearLabel} title={clearLabel}
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onClear(); } }}>
            <Icon name="x" size={13} />
          </span>
        ) : <Icon name="chevronDown" size={14} className="mx-menu-caret" />}
      </button>
      {open && <div className="mx-pop mx-menu-pop" style={{ width }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
