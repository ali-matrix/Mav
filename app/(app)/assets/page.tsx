import AssetsPage from "@/components/AssetsPage";

// /assets?q=…  starts with that search (the top search box).
// /assets?open=12  opens that asset's detail at once (used by the Assignments page).
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[]; open?: string | string[] }> }) {
  const sp = await searchParams;
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const open = Number(first(sp.open));
  return <AssetsPage initialQuery={first(sp.q) ?? ""} openId={Number.isInteger(open) && open > 0 ? open : undefined} />;
}