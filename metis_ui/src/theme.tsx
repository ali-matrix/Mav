"use client";
// @metis/ui — light / dark. First visit follows the device; once a person picks, their
// choice is kept per app (its own storage key). Applied before paint by `themeScript`.
// Switching only flips `data-theme` on <html>: no state, filter or scroll resets.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";

export type ThemeChoice = "light" | "dark";

const device = (): ThemeChoice => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function useTheme(key: string): [ThemeChoice, (c: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>("light");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(key); } catch { /* private mode */ }
    setTheme(saved === "dark" || saved === "light" ? saved : device());
  }, [key]);
  const set = useCallback((c: ThemeChoice) => {
    setTheme(c);
    document.documentElement.dataset.theme = c;
    try { localStorage.setItem(key, c); } catch { /* private mode */ }
  }, [key]);
  return [theme, set];
}

/** One button: flips light ⇄ dark and says which one a click gives. */
export function ThemeToggle({ storageKey }: { storageKey: string }) {
  const [theme, set] = useTheme(storageKey);
  const next: ThemeChoice = theme === "dark" ? "light" : "dark";
  return (
    <button className="mx-icon-btn" onClick={() => set(next)} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
