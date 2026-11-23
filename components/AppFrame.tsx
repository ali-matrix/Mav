"use client";
// The Mav screen frame on the suite kit: MG-blue rail + topbar. Every page renders inside it.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, Sidebar, ThemeToggle, Topbar } from "@metis/ui";
import AssetMark from "@/components/AssetMark";
import { PageExportContext, type PageExportAction } from "@/components/PageExportContext";
import { NAV_GROUPS } from "@/lib/nav";

export default function AppFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname.split("/")[1] || "dashboard";
  const [pageExport, setPageExport] = useState<{ path: string; action: PageExportAction } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const registerPageExport = useCallback((action: PageExportAction | null) => {
    setPageExport(action ? { path: pathname, action } : null);
  }, [pathname]);

  useEffect(() => { setExportError(""); }, [pathname]);

  async function runPageExport() {
    if (!pageExport || pageExport.path !== pathname || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      await pageExport.action();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const topbar = (
    <Topbar
      brand={
        <span className="mx-topbar-brand">
          <span className="mx-topbar-brand-mark"><AssetMark size={30} /></span>
          <span className="mx-topbar-brand-name"><b>Mav</b><small>Assets</small></span>
        </span>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--mx-2)" }}>
        <Button size="sm" variant="secondary" onClick={() => void runPageExport()}
          disabled={!pageExport || pageExport.path !== pathname || exporting}
          aria-label={`Export ${active} data`}>
          {exporting ? "Preparing…" : "Export"}
        </Button>
        {exportError && <span role="alert" title={exportError} style={{ color: "var(--mx-danger)", fontSize: "var(--mx-fs-meta)" }}>Export failed</span>}
        <ThemeToggle storageKey="asset-theme" />
      </div>
    </Topbar>
  );

  return (
    <PageExportContext.Provider value={registerPageExport}>
      <AppShell
        storageKey="asset-rail"
        topbar={topbar}
        rail={(collapsed, toggle) => (
          <Sidebar
            mark={<AssetMark size={34} />} app="Mav" sub="Assets"
            groups={NAV_GROUPS} active={active}
            onSelect={(key) => router.push(`/${key}`)}
            onPrefetch={(key) => router.prefetch(`/${key}`)}
            collapsed={collapsed} onToggle={toggle}
          />
        )}
      >
        {children}
      </AppShell>
    </PageExportContext.Provider>
  );
}