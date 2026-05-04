# Design System Spec

## Foundations

The design system is CSS-variable first and mapped into Tailwind v4 through `@theme inline` in `src/app/globals.css`. shadcn/ui remains the primitive layer, with application wrappers adding finance-specific language.

## Tokens

### Colour

| Token | CSS variable | Purpose |
| --- | --- | --- |
| Background | `--background` | Main app canvas. |
| Foreground | `--foreground` | Primary text. |
| Card | `--card` | Main card/table/modal surface. |
| Surface card | `--surface-card` | Explicit card role for custom components. |
| Surface raised | `--surface-raised` | Floating menus, popovers, elevated controls. |
| Surface muted | `--surface-muted` | Toolbars, table headers, inactive wells. |
| Surface subtle | `--surface-subtle` | Secondary blocks and skeletons. |
| Surface canvas | `--surface-canvas` | App shell gradient base. |
| Border | `--border` | Standard control/card/table border. |
| Border subtle | `--border-subtle` | Internal dividers and low-emphasis borders. |
| Primary | `--primary` | Primary actions, active tabs, focus, charts. |
| Accent soft | `--accent-soft` | Selected/hover item backgrounds. |
| Success | `--success`, `--success-soft` | Reconciled, paid, money in, complete. |
| Warning | `--warning`, `--warning-soft` | Needs review, stale, unmatched. |
| Danger | `--danger`, `--danger-soft` | Failed, destructive, conflict. |
| Info | `--info`, `--info-soft` | Submitted, processing, neutral guidance. |

### Radius

| Use | Class/token |
| --- | --- |
| Small chips | `rounded-md` |
| Buttons/small controls | `rounded-lg` / `rounded-xl` |
| Inputs | `rounded-xl` |
| Cards/tables | `rounded-2xl` |
| Modals/drawers | `rounded-2xl` / `rounded-3xl` |

### Shadow

| Token | Use |
| --- | --- |
| `shadow-soft` | Low-elevation layout pieces. |
| `shadow-card` | Cards, tables, stat panels. |
| `shadow-modal` | Dialogs, command palettes, elevated panels. |

## Typography

The app uses Geist Sans and Geist Mono.

| Role | Classes |
| --- | --- |
| `h1` | `text-2xl sm:text-3xl font-bold tracking-tight` |
| `h2` | `text-xl sm:text-2xl font-bold tracking-tight` |
| `h3` | `text-base font-semibold` |
| `body-md` | `text-sm leading-6` |
| `body-sm` | `text-xs/5` or `text-[13px] leading-5` |
| `label` | `text-xs font-semibold text-muted-foreground` |
| `caption` | `text-[11px] font-medium text-muted-foreground` |
| Money | `font-mono tabular-nums` for dense values; bold sans for dashboard headline values. |

## Component Variants

### Cards

Default cards use:
- `bg-card`
- `border-border/70`
- `rounded-2xl`
- `shadow-card`
- no heavy gradients

Interactive cards add:
- `hover:border-primary/20`
- `hover:shadow-soft`
- `transition-all`

### Buttons

- `default`: violet primary action.
- `outline`: white secondary action with border.
- `secondary`: muted background action.
- `ghost`: toolbar/menu action.
- `destructive`: red confirmation action.

### Inputs

Inputs, selects, textareas, and date controls should share:
- Height `h-10` or `h-11` depending density.
- Rounded `xl`.
- White/card fill.
- Soft border and violet focus ring.
- Clear invalid state with danger token.

### Tables

Tables should use:
- Rounded card container.
- Muted header row.
- `text-xs` semibold header cells.
- Row hover fill.
- Status pill rather than full-row colour.
- Compact action icons on the right.

### Status

Finance statuses map to semantic tones:

| Tone | Statuses |
| --- | --- |
| Success | `reconciled`, `posted`, `paid`, `complete`, `active`, `matched` |
| Warning | `unmatched`, `needs_review`, `suggested_match`, `stale`, `overspent`, `warning` |
| Danger | `failed`, `error`, `conflict`, `deleted`, `void`, `duplicate` |
| Info | `draft`, `submitted`, `processing`, `uploaded`, `pending` |
| Muted | `inactive`, `archived`, `excluded` |

## Layout

### App Shell

- Global navigation remains sidebar based.
- Content max width should be generous but controlled.
- Pages use `PageShell`.
- Page title and actions use `PageHeader` unless a feature has a purpose-built dashboard header.

### Page Pattern

1. Page header.
2. Optional alert/notice.
3. KPI or summary cards.
4. Toolbar filters.
5. Primary data surface: table, split workspace, or cards.
6. Empty/loading/error state embedded in the same surface.

## Accessibility Rules

- No nested anchors or buttons.
- Focus rings are always visible.
- Icon-only actions require labels or titles.
- Destructive confirmations must describe consequence.
- Charts need adjacent text summaries or explicit labels.
- Colour must not be the only status cue.

## Finance UX Rules

- Movement amounts: positive/incoming uses success, outgoing uses neutral or danger only when problematic.
- Balances: use neutral text unless variance/warning.
- Variance/difference: zero is success/neutral, non-zero is warning/danger depending severity.
- Reconciliation confidence uses clear labels: High, Medium, Low, Conflict.
- Avoid accounting-only terminology where a plain label works.
