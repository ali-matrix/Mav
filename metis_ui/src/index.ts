// @metis/ui — public surface. Import styles once in the app's root layout:
//   import "@metis/ui/tokens.css"; import "@metis/ui/kit.css";
// Every export here is documented in README.md (`node check.mjs` enforces it).
export { Icon, ICON_NAMES, type IconName } from "./icons";
export { themeScript } from "./themeScript";
export { useTheme, ThemeToggle, type ThemeChoice } from "./theme";
export { AppShell, Sidebar, Topbar, PageHeader, type NavItem, type NavGroup } from "./shell";
export { Button, IconButton, Segmented, Select, Switch, SearchField, FilterChips, MenuButton, type Option } from "./controls";
export {
  Card, KpiCard, KpiGrid, Sparkline, Meter, BarList, StatusBadge, Banner, Freshness, DataTable, Drawer, StateView, Skeleton,
  type Tone, type DataAttrs, type BarRow, type Column, type StateKind,
} from "./data";
export { RackScene, CartonsScene, DockScene, LabelScene, TruckScene, SheetScene } from "./illustrations";
export { TrendChart, ColumnChart, StatRow, type Series } from "./charts";
export {
  Delta, SyncStamp, HealthList, AlertList, InsightPanel, Ring, StackBar, FlowSteps, QuickActions,
  type HealthRow, type AlertRow, type Insight, type RingPart, type FlowStep,
} from "./exec";
export { TooltipLayer } from "./tooltip";
export { AppMark, MetisMark, PoweredByMetis, AskMetis } from "./brand";
export type { AppMarkName } from "./marks";
export { ChatPanel, type ChatMessage } from "./chat";
export { useConfirm } from "./confirm";
