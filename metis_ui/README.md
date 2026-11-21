# @metis/ui — the MG Apparel dashboard kit

**This file is the standard.** Every Metis dashboard builds its screens from this kit,
and this README says how each piece is used. When a core piece changes, this file
changes **in the same commit** (`node check.mjs` fails if an export has no section here).
The visual rules behind it are in `Metis_DesignLanguage/MG_APPAREL_DESIGN_SYSTEM.md` v1.0.
Visual references: `UI_template1.png`, `UI_template2.png`.

First app on it: **Stoa** (2026-10-30). Second: **TNA** (2026-11-02, branch `dashboard-ui-revamp`). Version: see `CHANGELOG.md`.

## The look (owner, 2026-10-30, v0.4; 2026-10-31, v0.5)

After Apple's design talks (`docs/design/DESIGN_SYSTEM_GUIDE.md`). A screen should look calm
and read fast:

- **One motion: the rail slides.** Everything else answers on the frame: no other transitions,
  keyframes, count-ups or moving illustrations (`kit.css` turns them off with a zero-specificity
  default, so only a rule that names a transition gets one). Press feedback is a background
  change on `:active`, never a movement. `prefers-reduced-motion` stops the slide too.
- **A hover never grows into its neighbour.** Hover and highlight rings are drawn inside the
  thing (negative `outline-offset`, inset shadow); nothing scales on hover.
- **Colour means something or it is absent.** Figures are ink. The five verdict tones
  (green, lime, amber, orange, red) colour the **word only**: no pill, wash, border or dot. Blue is for links and the selected thing. No coloured bars, tinted icon tiles or
  gradients on cards.
- **Hierarchy from size, weight and space.** Weights 400, 500, 600; tracking tightens as text
  grows. Nothing under 11.5 px, no tiny capitals.
- **One layer of surface.** No card in a card. Related figures sit in one strip with hairlines
  between them (`KpiGrid`).
- **The rail is the suite's MG Apparel blue** (Acta and Argus `--header-bg`: #2FA8DF light,
  #0E2235 dark); **the topbar is a material.** Content scrolls under the topbar
  and shows faintly through; it goes solid for `prefers-reduced-transparency` and
  `prefers-contrast`. This is the only blur in the kit.
- **The light theme wears the brand's pale blue**, not plain white. Dark is layered navy, never black.
- **No browser-native boxes.** Tooltips, confirms and popovers come from the kit.

## Why it is shaped this way (speed with many dashboards)

- **No runtime dependencies** except React. Icons (Lucide line icons, inlined), charts and illustrations are plain SVG.
  There is no icon pack, chart library or CSS-in-JS on the first load.
- **One CSS file pair** (`tokens.css` + `kit.css`, a few KB, cached once per app). Every
  class is `mx-*`, every value a `--mx-*` token.
- **TypeScript source, compiled by the app** (`transpilePackages`), so each app tree-shakes
  what it imports.
- **Installed as a copy, not a link** (`.npmrc install-links=true`). Next/Turbopack won't
  read files outside the app folder, and pointing it at the whole repo would make it
  watch every app and data folder. Each app picks up kit changes with `npm run ui:sync`.
  `prebuild` runs it, so every build uses the current kit.

## Add it to a dashboard

```jsonc
// package.json
"dependencies": { "@metis/ui": "file:../metis_ui" },
"scripts": {
  "ui:sync": "node -e \"require('fs').rmSync('node_modules/@metis/ui',{recursive:true,force:true})\" && npm install --no-audit --no-fund ../metis_ui",
  "prebuild": "npm run ui:sync"
}
```
```
# .npmrc
install-links=true
```
```ts
// next.config.ts
transpilePackages: ["@metis/ui"],
```
```tsx
// app/layout.tsx
import { themeScript } from "@metis/ui";
import "@metis/ui/tokens.css";
import "@metis/ui/kit.css";
// <head><script dangerouslySetInnerHTML={{ __html: themeScript("<app>-theme") }} /></head>
```

**Tailwind apps:** put `@layer mx-reset, theme, base, components, utilities;` above
`@import "tailwindcss";` in the app's stylesheet. Without it the kit's reset can outrank
Tailwind's utilities, and buttons inside the shell lose their padding.

## Tokens (`src/tokens.css`)

| Group | Tokens | Rule |
|---|---|---|
| Brand | `--mx-brand-050 … 800` | Sampled from the approved logo: **#27AAE1** (the spec's provisional #12A8E8 is replaced). |
| Rail | `--mx-rail-*` | The suite blue, taken from Acta/Argus `--header-bg` (owner, 2026-10-31): #2FA8DF light, #0E2235 dark, the same white-on-blue as their headers. The app mark sits in its own colours, never recoloured. |
| Surfaces | `--mx-canvas`, `--mx-surface-1/2/3`, `--mx-border(-strong)` | **Not all white**: light theme wears the brand's pale blue (canvas #E6F1F8, cards #F8FCFE). Dark is layered navy, never black. |
| Text | `--mx-text-1/2/3` | 3 is metadata only. |
| Status | `--mx-ok/fair/warn/severe/danger` (verdicts, best to worst), `--mx-info/neutral`, each + `-wash` | Colours the WORD; never colour alone and never behind it. Washes are for chart fills only. Each is at least 4.5:1 on surface-1. |
| Series | `--mx-series-1 … 6` | One order in every chart in every app. |
| Space / radius / type | `--mx-1 … 16`, `--mx-r-*`, `--mx-fs-*` | 4 px base. |
| Motion | `--mx-ease`, `--mx-dur-rail` | The rail slide only. |
| Iso | `--mx-iso-*` | Faces of the illustrations, per theme. |

**Never write a raw colour in a component.** Add a token, document it here.

## Shell

### AppShell
`<AppShell rail={(collapsed, toggle) => <Sidebar …/>} topbar={<Topbar …/>} storageKey="<app>-rail">`. Rail + topbar + centred
content (max 1600 px). Remembers its state; on desktop the rail slides completely off the left edge and the content
expands, with a persistent topbar-side button to slide it back in (`--mx-dur-rail`). Below 1024 px the rail stays icons only;
below 640 px it becomes a bottom bar.

### Sidebar
Props: `mark` (the dashboard's `<AppMark>`), `app`, `sub`, `groups: NavGroup[]`, `active`, `onSelect`, `footer?`,
`collapsed`, `onToggle`, `onAsk?` + `asking?` (v0.8: the foot becomes **AskMetis**, the door to the chat).
A `NavItem` with `href` is a real link (another dashboard, a PDF; `external` opens a new tab) instead of calling `onSelect`;
`data` puts `data-*` hooks on the entry (e.g. a navigation target). Pass **only the pages this person may open**. The server must
refuse the rest too: hiding is not access control. A `badge` is a count waiting for a person.
The desktop hide button is in the first brand row; when the rail is hidden, a persistent button at
the top-left of the topbar shows it again. The rail slides fully left while the page content expands.
On a tablet (rail always icons only) the hide buttons are hidden and the mark takes the top spot.
The current page is a white plate with blue words on the light rail and a surface step on the
dark one (`--mx-rail-active`, `--mx-rail-active-text`); hover is a fainter step.

### Page rows (`.mx-row`)
`mx-row mx-row-lead` (trend beside the exceptions), `mx-row-3`, `mx-row-2`: the grid every executive page is laid out on;
they fold to one column on a tablet. Add `mx-section` for the gap above.

### Topbar
Global search (`search` slot) on the left, then global controls only: store/factory scope,
guide, export, about-the-data, theme, account. **Page filters never go here.**

### PageHeader
`title`, `description` (what this page tells me), `aside` (the page's filters and buttons),
`art` (one small illustration, optional). Every page starts with one. Title at the left and
description at the right on ONE line; `aside` on the row below, never beside the words (owner,
2026-10-31). On a phone the description drops under the title.

## Controls

### Button
`variant: primary | secondary | ghost`, `size: sm | md | lg`, `icon?`. One primary per area.
Label with a verb ("Make 3 labels", "Print").

### IconButton
Icon-only. `label` is required: it becomes the accessible name and tooltip.

### Segmented
2–5 mutually exclusive choices (a view toggle). More than 5 → Select. On a narrow screen the
options wrap onto a second line rather than clip.

### Select
A native `<select>` with a visible `label` (`hideLabel` only when the context already says it).

### Switch
An on/off setting with its label.

### SearchField
A search box with a **placeholder example of what can be searched** and an aria-label.

### MenuButton
A page-wide scope or filter that opens a menu (period, customers, stores): `icon`, `label` (what is chosen), `on`
(it narrows the page: `data-on`), `onClear` (the ×), `children(close)` = the menu body, built from `.mx-pop-*`
(`.mx-pop-sep`, `.mx-pop-row` for an input row). Closes on a click outside or Escape. On a phone the menu spans the screen.

### FilterChips
Applied filters as removable chips, plus "Clear all" when more than one. Renders nothing when none apply.

## CSS-only pieces (no component; use the classes)

| Class | Use |
|---|---|
| `.mx-section-label` (`h3`, `span`, `i`) | A heading with a rule between groups on a page. |
| `.mx-pop`, `.mx-pop-head`, `.mx-pop-item` (`aria-selected`), `.mx-pop-hint`, `.mx-check` | Popover menus and multi-pick lists. Never the browser's own list. |
| `.mx-pager` | The count and page buttons under a table. |
| `.mx-btn[data-on]` | A button holding an active filter. |
| `.mx-card-head-ruled` | A card head with a rule under it, for a card that holds a table. |

## Data display (presentational: figures arrive computed)

### Card
`title`, `sub` (unit, scope, date basis), `actions`, `flush` (for tables), `data` (`DataAttrs`: `data-*` hooks such as a
navigation target id; `KpiCard` takes it too). The basic panel.
`actions` sit on the row under the title and sub, never beside them.

### KpiCard / KpiGrid
`label`, `value`, `unit`, `icon`, `tone`, `foot` (the comparison that gives the number meaning),
`delta {text, dir, tone}`, `spark`, `onClick`, `selected`, `lead`.
- Pass `onClick` **only** when a real filtered view exists. It then renders as a button with a pressed state.
- `delta.tone` comes from an **approved** direction (is higher good?), never a guess.
- `status {tone, word}`: the verdict from an approved rule. Its word sits in the corner in its
  colour; the **figure takes the colour when the verdict needs attention (warn, severe, danger)**,
  text only; a good verdict (ok, fair) stays ink. `figureTone` lets the page decide instead
  (a tone, or `"ink"` to keep a figure plain beside a bad word, e.g. a count of movements).
  No rule, no status: the figure stays ink. The arrow of a clickable card sits beside the label.
- `lead`: the band's lead figure (one per band): twice the row share, at the display size.
- A stat card is a number: no `spark` in an executive band.
- `KpiGrid` lays out 4–6 in one row. More than 6: group them, don't shrink them.

### Sparkline
A tiny trend for a KPI corner. Never the only place a figure appears.

### Meter / BarList
Category ranking as horizontal bars (spec §6.3). `BarList` rows may be clickable (`onClick`).

### StatusBadge
`tone` + a **word** ("All labelled", "Void"), drawn as the coloured word alone.

### Banner
A page-wide notice (test system, data stopped). `tone` + `icon` + words in the tone's colour, no box.

### Freshness
"Live · checked 12s ago" in the state's colour, no dot. `state: live | delayed | stopped`. The app decides which, from its own sync clock.

### TrendChart / StatRow
One time-series question: lines with a hover rule + tooltip, a legend, and a hidden text
`summary` for screen readers. Always lines; under 7 points each day also wears a dot. `StatRow` holds the label + value pairs under it.

### DataTable
`columns` (`num` right-aligns with tabular figures; `sortable`), `rows`, `rowKey`, `onRow`
(only when a row has a detail to open), `sort`/`onSort`, `empty`. Sticky header.

### Drawer
Quick record inspection that keeps the page behind it. Focus moves in, Escape closes, and
focus returns to where it was.

### StateView / Skeleton
`kind: loading | empty | no-results | error | partial | stale | restricted`. All seven look
different. Write the words for this case ("No movements yet. New ones appear within…").

### ColumnChart
A handful of categories or periods as columns (ageing buckets, months). `bars` with
`label`, `value`, `tone` (a colour token), optional `onClick` (only when the bar opens a
real filtered view) and `note` (tooltip). Bars grow up in turn when they arrive.

## Executive pieces (`src/exec.tsx`, v0.3)

The ten rules every executive page follows, and the piece that serves each:

| # | Rule | Piece |
|---|---|---|
| 1 | Lead with outcomes (value, health, delivery), not activity counts | Order of the page: KPIs first |
| 2 | Every KPI has context: actual, comparison, share, previous period | `KpiCard` `context` / `share` / `delta.basis` |
| 3 | Exceptions over normality: the 5 things to act on, not 50 that are fine | `AlertList` |
| 4 | Trends, not snapshots | `TrendChart`, `Sparkline`, `ColumnChart` |
| 5 | Whitespace: never fill every pixel | Rows of 2–3 cards, `mx-section` gaps |
| 6 | Summary first, detail on demand | Every KPI / alert / health row opens its page |
| 7 | Freshness visible | `SyncStamp` in every page header |
| 8 | One colour language: red bad, amber attention, green healthy, everywhere | `Tone`, never per-page colours |
| 9 | Numbers get a narrative | `InsightPanel` |
| 10 | Every warning leads somewhere | `AlertList` / `HealthList` rows take `onClick` |

**Never invent a target or a threshold.** Where the source has no target, the context is
the period's own parts, a share of a whole, or the previous period. A verdict word
(`status`, `HealthRow.word`) comes only from a rule the business already uses; say whose.

### KpiCard (v0.3 additions)
`context` — up to four `{label, value, tone?}` rows under the number (what makes it up).
`share` — `{pct, label}`: a thin meter for "x % of the whole". `status` — `{tone, word}`:
the one-word verdict in the corner, from an approved rule only. `delta.basis` names what
the change is against ("vs September").

### Delta
`dir`, `text`, `basis`, `tone`: "↑ 8.2% vs last month". Tone from an approved direction
(is up good here?); without one it stays neutral.

### SyncStamp
"Last synced 10:24 · 30 Oct 2026  [Live]". `state: live | delayed | stopped`, `at`. Sits in
the topbar on every page. The state word ("Live", "Delayed", "Not live") carries the colour; no dot.
Before the first read (`at` empty) it shows only "Checking".

### HealthList / HealthRow
One line per area: label, small detail, and the verdict **word** in its tone (no dot). Rows
with `onClick` open that area.

### AlertList / AlertRow
The exceptions, worst kind first then largest: a quiet icon, the title (the count in words) in
the tone's colour, detail (the impact) and a chevron; `action` is the tooltip. Pass `empty` for the
"nothing waiting" state. Show at most five.

### InsightPanel / Insight
The page's numbers told as a story in a few numbered lines, on the soft insight wash.
Each line is **built from figures already on the page** (never generated text), may open
its detail, and the `signature` says who worked it out and when. `art` takes one
A still illustration scaled to the panel.

### Ring / RingPart
A donut of parts that make a whole, the headline in the middle, the legend beside it. The
ring is never the only place a figure appears.

### StackBar
One whole split along one line (placement, ageing), legend underneath.

### FlowSteps / FlowStep
A pipeline read left to right ("came in → used → in stores now"): circle icon, label,
value. Connectors fill in turn on arrival.

### QuickActions
Where to go next, as verbs ("Print bin labels"). Each opens a page.

## MetisMark / PoweredByMetis / AskMetis / ChatPanel

**AskMetis** (v0.8, owner 2026-11-02): the signature grown into the door to Metis's chat: the mark at chat size,
"Ask Metis", "Powered by Metis" under it. The Sidebar draws it when given `onAsk`; on a phone the mark floats above
the tab bar instead.

**ChatPanel** (`ChatMessage`): the conversation, docked on the right with **no scrim** so the page behind stays live
while Metis moves it. Presentational: the app sends the question and drives its page; the panel lays out the answers
(`tone`, `note`, `links`, `moved`, `followups`, `copy` — v0.9: the plain answer, for a "Copy" action), the opening `prompts`, "New chat" (`onReset`), ↑/↓ history and Escape.
One per app, opened from the rail.

Every dashboard is signed "Powered by Metis". The Sidebar puts `PoweredByMetis` at its foot
automatically. `MetisMark` (`round` parchment disc, or `bare` in currentColor) is for anywhere
else the suite mark belongs (sign-in, about). It is Metis's own sign and stays as drawn, in its colours (owner): it is not an `AppMark`.

## AppMark / AppMarkName

`<AppMark app="stoa" size={30} />`: a dashboard's mark. `AppMarkName` is `tna · production · chronos · saga · argus · acta · stoa · agora`.

- **White in both themes** (`--mx-mark`), so it cuts through the header and rail, which are `#2FA8DF` in light and `#0E2235` in dark. It does not change with the theme: there is one logo.
- **Off the header, pass `plate`**: the same white mark on a brand-blue tile (sign-in sheets, pale cards). A bare white mark on a light surface disappears.
- **Sizes:** 30 on the rail, 36 on a header. Vector, so it is sharp at any size.
- **To change or add a drawing:** edit `marks/<app>.svg`, on a 64-unit grid with 4-unit round strokes and solid shapes for the one thing that matters, then run `node scripts/build-marks.mjs`. It writes `src/marks.ts`, the `AppMark.tsx` of each app not on the kit yet, and the white files in `metis_thinking/branding/`. `node check.mjs` fails if any has drifted.

| Mark | Drawing | Why |
|---|---|---|
| `tna` | Stopwatch; the tick breaks out through the dial | Time & Action: the deadline met |
| `production` | A rising line of stitches, sewn by a needle | The floor's output |
| `chronos` | Staggered runs on a timeline, and the line that is now | The sewing schedule |
| `saga` | A garment with a play button | Press play on an order that does not exist yet |
| `argus` | A support headset | The IT desk: someone is on the line |
| `acta` | A register page, a tally, a seal | The record of the day, and payroll signed off |
| `stoa` | A Greek colonnade whose columns are rack uprights, with stock in the bays | The hall where goods were kept, as a warehouse |
| `agora` | A market hall with a coin in the gable | Purchasing and suppliers |

## Illustrations (`src/illustrations.tsx`)

Still drawings of the things a warehouse is made of: kraft cartons with taped seams, timber
pallets, painted rack steel, printed labels, one light from the top left and a soft shadow.

| Component | Shows | Used for |
|---|---|---|
| `RackScene` | a bay of pallet racking with stock | a floor with no racks; a floor map's side panel |
| `CartonsScene` | a loaded pallet, cartons carrying QR labels | nothing received or found; all clear |
| `DockScene` | a receiving dock with a delivery | one quiet panel on an overview |
| `LabelScene` | printed QR box labels | a label page before anything is chosen |
| `TruckScene` | a hand pallet truck moving a loaded pallet | no movements, nothing waiting to be issued |
| `SheetScene` | a costing sheet on a clipboard beside a fabric roll | costing with nothing counted yet; a money page's side panel |

Each takes an optional `label` (else it is hidden from screen readers), fills its container's
width and follows the theme through `--mx-ill-*`. **Size the box, never the scene.** `StateView`
sizes its `art` for you. Use them on empty states and at most one quiet panel per page; never
behind data or in a table. They never move.

## Icons

`<Icon name="…" />`: one family, **Lucide 0.469.0 line icons**: one 1.75 stroke on a 24 grid, in
the colour of the text beside them, their node data inlined so no app installs an icon package.
Names: `ICON_NAMES`. Decorative by default. Pass `label` when an icon stands alone. Add icons in
`src/icons.tsx` only, copying the node array from `lucide-react@0.469.0`
(`dist/esm/icons/<name>.js`, without `key`).
`panelClose` / `panelOpen` (panel-left-close / -open) are the rail's collapse and expand.

Attribution: icons by Lucide Contributors, ISC licence, https://lucide.dev/license.

## TooltipLayer

Mounted once by `AppShell`. It takes over **every** `title` attribute and every `data-tip`, on
hover and keyboard focus, and shows the kit tooltip: solid surface, accent border, arrow.
The browser's black-and-white box never appears. Add `data-tip-head` for a bold first line.
Keep writing `title="…"`: the layer converts it, and an icon-only control gets the text as its aria-label.

## useConfirm

`const [ask, dialog] = useConfirm();` render `{dialog}`, then
`if (await ask({ title, body, ok: "Remove", danger: true })) …`. Use it for irreversible actions
only, never for navigation. `danger` gives a red edge and a red button.

## Theme

`themeScript(key)` in `<head>` (before paint) · `useTheme(key)` · `<ThemeToggle storageKey>`.
Two states only, light and dark. The first visit follows the device; a click flips it, and the
choice is kept per app. Switching changes only `data-theme`: no filter, sort or scroll resets.

## Print

When printing, the rail and topbar are hidden and the content runs full width. Apps add
their own paper styles (Stoa: box and bin labels).

## Types

| Type | What it is |
|---|---|
| `NavItem` / `NavGroup` | One sidebar entry (`key`, `label`, `icon`, `badge?`, `hint?`) / a titled group of them. |
| `Option` | One choice for Segmented / Select (`key`, `label`, `hint?`). |
| `Tone` | `ok · warn · danger · info · neutral · brand`: the status colours, always paired with words. |
| `BarRow` | One BarList row (`key`, `label`, `value`, `display`, `tone?`, `onClick?`, `title?`). |
| `Column` | One DataTable column (`key`, `label`, `num?`, `sortable?`, `width?`, `render`). |
| `StateKind` | The StateView cases. |
| `Series` | One TrendChart line (`key`, `label`, `values`, `color?`, `area?`). |
| `IconName` | A name from the icon set. |
| `ThemeChoice` | `light · dark`. |

## When you change the kit

1. Change `src/`, then update **this README** (and `CHANGELOG.md`) in the same commit.
2. `node check.mjs`: every export has a section here.
3. Run `npm run ui:sync` in each app that uses the kit, then type-check it.
