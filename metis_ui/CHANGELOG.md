# @metis/ui — changelog

## Unreleased
- **AppShell rail:** desktop hide/show now slides the whole rail off and back in from the left; a persistent button
  reopens it. Tablet icon-only navigation and the mobile bottom bar are unchanged.

## 0.10.0 — 2026-11-05 (branch `dashboard-ui-revamp`)
Owner: the Teams outline icons replace the coloured logo tiles, as sharp vectors, white in both themes.
- **AppMark** / `AppMarkName`: one white mark per dashboard (`tna`, `production`, `chronos`, `saga`, `argus`, `acta`, `stoa`, `agora`). `plate` puts it on a brand-blue tile for surfaces off the header.
- `marks/*.svg` is the one drawing of each; `scripts/build-marks.mjs` builds `src/marks.ts`, the `AppMark.tsx` of apps not on the kit yet and `metis_thinking/branding/*_teams_outline.svg`. `check.mjs` fails on drift.
- New marks: **Stoa** (a colonnade whose columns are rack uprights) and **Agora** (neither had a Teams icon).
- **MetisMark is unchanged** (owner): it is Metis's own sign, not an AppMark.
- Token: `--mx-mark`.

## 0.9.0 — 2026-11-02 (branch `dashboard-ui-revamp`)
- **ChatPanel**: `ChatMessage.copy` (the answer as plain text) adds a "Copy" action under it; the panel is 460 px wide.
- **TrendChart**: lines at 2.25 px, no wash under them (owner: solid colours, no gradient glow). **ColumnChart**: solid columns; past eight columns the figures move into each column's tooltip.

## 0.8.0 — 2026-11-02 (branch `dashboard-ui-revamp`)
Owner: every dashboard looks like Stoa; TNA is the second app on the kit. Nothing breaks for Stoa.
- **AskMetis**: the rail's "Powered by Metis" grown into the door to Metis's chat (Sidebar `onAsk`, `asking`). On a phone the mark floats above the tab bar.
- **ChatPanel** / `ChatMessage`: the Metis conversation, docked right with no scrim; presentational (the app asks and navigates).
- **MenuButton**: a scope or filter with its own popover (period, customers, stores); `.mx-pop-sep`, `.mx-pop-row`.
- **Page rows** `.mx-row` + `-lead` / `-3` / `-2` (Stoa's `ov-row-*`, moved into the kit for every app).
- `NavItem.href` / `external` (a real link in the rail, with a small arrow when it opens a new tab) and `NavItem.data`.
- `Card` and `KpiCard` take `data` (`DataAttrs`): `data-*` hooks such as a navigation target id.
- Icons: `send`, `flow` (workflow), `truck`, `factory`, `shirt`, `briefcase`, `trend` (trending-up), from Lucide 0.469.0.

## 0.7.5 — 2026-11-02
- **A small ghost button in a Card's actions lines up with the title**: its word starts on
  the title's edge rather than 9 px inside it.

## 0.7.4 — 2026-11-02
- **Segmented inside a form no longer submits it**: its buttons are `type="button"`.
  Stoa's Box labels search ran with the old mode whenever the switch was pressed.

## 0.7.3 — 2026-11-02
- **TrendChart is always lines again** (owner); under 7 points each day wears a dot instead
  of turning into columns.

## 0.7.2 — 2026-11-02
- **KpiCard `figureTone`** (tone or `"ink"`): the page decides a figure's colour when the
  verdict rule is not the right one (owner: idle stock amber, movements never coloured).
  The coloured figure is `.mx-kpi-value.mx-kpi-toned`.

## 0.7.1 — 2026-11-02
- **KpiCard `status`** colours the figure again for warn as well as severe and danger (owner:
  "bring back some of the coloured KPI numbers"); ok and fair stay ink.

## 0.7.0 — 2026-11-02
Owner (Stoa unslop pass): quieter colour, one type scale, line icons, a clear current page.
- **Icons are Lucide 0.469.0 line icons** (one 1.75 stroke, the colour of their text), inlined
  as node data in `src/icons.tsx`; still no runtime dependency, same `<Icon name>` API and
  every name kept (`coins` now draws a banknote). Replaces Font Awesome's filled glyphs.
  Icons © Lucide Contributors, ISC licence (https://lucide.dev/license).
- **Rail current page:** a white plate with blue words on the light rail (a surface step on
  the dark one); items at weight 500, 2 px apart; the badge follows the plate's colour.
- **One type scale:** 12 / 13 / 15 / 17 / 28 / 32 px (`--mx-fs-body` 13, `--mx-fs-section` 17)
  and weights 400 / 500 / 600; no negative letter-spacing below 20 px.
- **KpiCard `status`** colours the figure only for severe or danger; a milder verdict is its
  word alone. The arrow sits beside the label (it no longer wraps onto its own line).
  New `lead` prop: the band's lead figure takes twice the row share at the display size.
- **AlertList:** titles in ink, the icon carries the tone.
- **TrendChart** draws each day as a group of columns under a week of points (a line through
  two days says nothing).
- **SyncStamp** says "Checking" before the first read instead of "Delayed · not yet".
- **Motion:** hover and press fade colour and surface in 120 ms (`--mx-dur-hover`); size never
  animates. The rail slide is unchanged.
- Dark theme: `--mx-accent-text` is the chart blue (`--mx-brand-400`), so there is one blue.

## 0.6.0 — 2026-10-31
Owner (Stoa round 2): better icons, KPIs that read as traffic lights.
- **Icons are Font Awesome Free 7.3.1** (solid, with regular `bell`, `clock`, `calendar`),
  inlined as path data in `src/icons.tsx`, so still no runtime dependency. Same `<Icon name>`
  API and every old name kept. New names: `coins`, `tags`, `clipboard`, `list`, `hourglass`,
  `archive`, `ruler`, `repeat`, `store`, `calendar`. The collapse toggle is `outdent` / `indent`.
  Icons © Fonticons, Inc., CC BY 4.0 (https://fontawesome.com/license/free); the kit's code
  around them is unchanged.
- **KpiCard `status` colours the figure** as well as its corner word (text only, no wash):
  `.mx-kpi-value[class*="mx-tone-"]`. Still only from an approved rule.
- **Rail toggle at the top:** the collapse / expand button is the first thing in the brand row,
  a 36 px square on the collapsed rail's centre line, so it is in one spot open or shut; the
  foot keeps only "Powered by Metis". Hidden on a tablet, where the rail is always icons only.
- **New illustrations `TruckScene`** (a hand pallet truck with a load) and **`SheetScene`**
  (a costing sheet on a clipboard beside a denim roll), same drawing kit.
- **Tighter page rhythm:** 24 px above the title, 24 px from header to content, 16 px between
  sections (`.mx-content`, `.mx-page-head`, `.mx-section`).
- **KpiGrid** wraps as a row, so a short last row stretches to the full width (five figures
  never leave an empty cell).
- **Segmented** wraps its options onto a second line when the row is too narrow (a phone),
  instead of clipping the last one.

## 0.5.0 — 2026-10-31
Owner (Stoa polish pass): more traffic-light tones on text only, the right blue rail that
slides, controls under the words, nothing hovering into its neighbour.
- **Rail blue:** `--mx-rail-bg` is the suite's MG Apparel blue, Acta/Argus `--header-bg`
  (#2FA8DF light, #0E2235 dark), with lighter white overlays for hover and selected.
- **The rail slides** open and shut (`--mx-ease`, `--mx-dur-rail`); the words fade. Every
  icon sits on the collapsed rail's centre line, so nothing inside moves. The kit's motion
  switch-off is now a zero-specificity default (only a rule that names a transition gets one),
  and `prefers-reduced-motion` still stops everything.
- **Collapse button** moved from the brand row to a row at the rail's foot, at the same spot
  open or shut. New icons `panelClose` / `panelOpen` replace `panel` there.
- **Verdict tones: five, text only.** New `--mx-fair` (lime) and `--mx-severe` (orange) between
  ok, warn and danger; `Tone` gains `"fair" | "severe"`. `.mx-badge` / `StatusBadge` are the
  coloured word alone (no wash, padding or radius); `Banner` is coloured words with its icon,
  no box; `HealthList` and `SyncStamp`/`Freshness` lose their dots; `AlertList` colours the
  title, not the icon.
- **PageHeader:** title left and description right on one line; `aside` (filters, buttons) on
  the row below. **Card:** `actions` on the row under the title.

## 0.4.0 — 2026-10-30
Owner: follow the Apple design guide, remove animations, make the illustrations amazing, no AI
look. **Breaking for any app using the removed exports.**
- **No motion.** `@metis/ui/motion` and the Remotion dependency are gone (the Remotion company
  licence is no longer needed). `kit.css` switches animation and transition off page-wide;
  `--mx-t-*` and `--mx-ease-*` are removed.
- **Illustrations redrawn:** `RackScene`, `CartonsScene`, `DockScene`, `LabelScene` with
  `--mx-ill-*`. Removed `IsoScene`, `IsoRack`, `IsoBoxes`, `IsoPrinter`, `IsoWarehouse`,
  `IsoBin`, `FACES`, `isoBlock`, `isoBounds`, `isoProject`, `isoQr` and `--mx-iso-*`.
- **Look:** flat rail with a quiet selected row; translucent topbar; alpha hairlines; dotless
  status words; KPIs as one strip with no tone bars or icon tiles; no gradients
  (`--mx-grad-*` removed); weights 400–600.
- `KpiCard`: `icon` is accepted but no longer drawn; a clickable card shows a chevron.
- `AlertList`: a chevron replaces the count pill and hover action; `action` is the tooltip.
- `InsightPanel`: plain sentences; the `badge` prop and numbering are gone.
- `FlowSteps`: figures between hairlines; `FlowStep.icon` and `tone` removed.
- `SyncStamp`: a dot, the state word and the time, with no pill.
- `TrendChart`: x labels no longer collide; a tighter axis top; a fill only under a lone line.

## 0.3.0 — 2026-10-30
Owner: data-rich executive dashboards after the ten design rules; subtle gradients allowed;
Remotion for motion; one theme so every future dashboard updates from here.
- Subtle gradients replace v0.2's solid-only rule: rail wash (`--mx-rail-bg`), chart areas,
  insight panel (`--mx-grad-insight`, `--mx-grad-hero`). No glows, glass or blur.
- Executive pieces (`exec.tsx`): `Delta`, `SyncStamp`, `HealthList`, `AlertList`,
  `InsightPanel`, `Ring`, `StackBar`, `FlowSteps`, `QuickActions`. README §Executive pieces
  maps each to its rule.
- `KpiCard`: `context` rows, `share` meter, `status` word, `delta.basis`; the sparkline runs
  flush along the card's foot.
- `TrendChart`: value axis, gradient area, round hover dots, lines draw themselves in.
  New `ColumnChart`. Meters and bars grow in on arrival.
- `@metis/ui/motion`: `LiveScene` (Remotion) — receiving, putaway, label, stack loops that
  fill their container, pause off screen, and hold still under reduced motion.
- `IsoScene`: `fluid`, `box`; helpers `isoBlock`, `isoBounds`, `isoProject`, `isoQr`.
- Tokens: `--mx-fs-display`, `--mx-t-draw`, `--mx-ring-track`.

## 0.2.0 — 2026-10-30
Owner: solid colours, good borders, colour and hover; no native browser boxes.
- Removed every gradient, glow, blur and glass effect. The rail is solid brand-700, and the topbar is solid.
- The logo sits on a white tile in its own colours (no recolouring).
- Hover states: card border; KPI tone bar, tone border and solid icon fill; row/bar tint with an accent edge; accent buttons; rail items slide.
- `TooltipLayer` (in AppShell) replaces every native `title` box. `useConfirm` replaces `confirm()`.
- Brand: Sidebar takes the dashboard's own `mark`; `PoweredByMetis` sits at the foot of every rail; `MetisMark` joins the kit.
- Light surfaces wear the brand's pale blue instead of white; borders are stronger.
- Collapse is a toggle button at the top of the rail.
- CSS pieces: section label, popover menu, pager, ruled card head. Resets sit in the `mx-reset` cascade layer, so Tailwind's layered utilities are never wiped.
- Theme is two states (light/dark): the device's on first visit, then the person's choice.
- Resets use `:where()` (zero specificity), so app classes are never overridden by the kit.
- Skeleton pulses instead of sweeping a gradient. Charts use flat fills.

## 0.1.0 — 2026-10-30 (branch `stoa-ui`)
First version, built with Stoa's revamp.
- Tokens from design system v1.0, brand blue sampled from the logo (#27AAE1); sidebar on brand-700/800 for AA contrast.
- Shell: AppShell, Sidebar (grouped, collapsible, bottom bar on phones), Topbar, PageHeader.
- Controls: Button, IconButton, Segmented, Select, Switch, SearchField, FilterChips.
- Data: Card, KpiCard/KpiGrid, Sparkline, Meter/BarList, StatusBadge, Banner, Freshness,
  TrendChart/StatRow, DataTable, Drawer, StateView/Skeleton.
- Isometric illustrations (IsoScene, IsoRack, IsoBoxes, IsoPrinter, IsoWarehouse, IsoBin), icon set, theme (light/dark/system), print rule.
