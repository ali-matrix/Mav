"use client";
// The Mav screen frame on the suite kit: MG-blue rail + topbar. Every page renders inside it.
import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Sidebar, ThemeToggle, Topbar } from "@metis/ui";
import AssetMark from "@/components/AssetMark";
import { NAV_GROUPS } from "@/lib/nav";

export default function AppFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname.split("/")[1] || "dashboard";

  const topbar = (
    <Topbar
      brand={
        <span className="mx-topbar-brand">
          <span className="mx-topbar-brand-mark"><AssetMark size={26} /></span>
          <span className="mx-topbar-brand-name"><b>Mav</b><small>Assets</small></span>
        </span>
      }
    >
      <ThemeToggle storageKey="asset-theme" />
    </Topbar>
  );

  return (
    <AppShell
      storageKey="asset-rail"
      topbar={topbar}
      rail={(collapsed, toggle) => (
        <Sidebar
          mark={<AssetMark size={30} />} app="Mav" sub="Assets"
          groups={NAV_GROUPS} active={active}
          onSelect={(key) => router.push(`/${key}`)}
          collapsed={collapsed} onToggle={toggle}
        />
      )}
    >
      {children}
    </AppShell>
  );
}