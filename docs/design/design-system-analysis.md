# Design System Analysis

## Source References

The reference set points to a premium, modern SaaS product language: white cards on a soft grey canvas, violet as the primary brand colour, restrained typography, compact controls, rounded tables, and finance-friendly chart surfaces. The images include dashboard cards, stat strips, tables, forms, modals, menus, charts, upload states, onboarding steps, authentication forms, and empty states.

## Visual Identity

### Colour Roles

| Role | Direction | Usage |
| --- | --- | --- |
| `background-primary` | Very light cool grey | App shell and page background. Keeps finance screens calm and low-glare. |
| `background-secondary` | White to near-white | Nested sections, toolbar strips, table headers. |
| `surface-card` | White | Cards, tables, modals, drawers, form panels. |
| `surface-muted` | Cool grey tint | Empty icon wells, subtle inactive states, table headers, inactive tabs. |
| `border-subtle` | Light neutral grey | Card outlines, table rows, form controls. |
| `text-primary` | Near-black cool neutral | Headings, money values, primary labels. |
| `text-secondary` | Mid grey | Descriptions, helper text, secondary metadata. |
| `text-muted` | Light grey | Placeholder text, timestamps, inactive labels. |
| `accent-primary` | Violet / purple | Primary buttons, active tabs, focus states, charts, links. |
| `accent-soft` | Pale violet | Icon wells, hover states, selected nav. |
| `success` | Green | Money in, reconciled, paid, complete, positive movement. |
| `warning` | Amber | Review needed, unreconciled, stale imports, attention states. |
| `danger` | Red | Destructive actions, failed uploads, conflicts, deletion. |
| `info` | Blue | Submitted, informational notices, neutral process states. |

### Palette Characteristics

- The UI is predominantly light theme: white surfaces, pale grey canvas, low-contrast borders, and high-contrast text.
- Violet is used sparingly but consistently for hierarchy and action, not as a full background except in marketing-style hero/stat blocks.
- Success and danger are clear but softened with pale background chips.
- Charts use violet gradients and neutral greys; colours should carry meaning and not become decorative noise.

## Typography System

The reference images match a modern sans-serif system, compatible with the app's current Geist font. Typography is clear, bold where necessary, and compact in dense operational views.

| Token | Size | Weight | Line height | Usage |
| --- | ---: | ---: | ---: | --- |
| `h1` | 28-32px | 700 | 1.15 | Page titles and major workflow headers. |
| `h2` | 20-24px | 700 | 1.2 | Section titles, modal titles. |
| `h3` | 16-18px | 650 | 1.3 | Card titles and table panel titles. |
| `h4` | 14-15px | 650 | 1.35 | Subsection labels. |
| `body-lg` | 16px | 400-500 | 1.6 | Intro copy and form helper text. |
| `body-md` | 14px | 400-500 | 1.55 | Default app text and table body. |
| `body-sm` | 13px | 400-500 | 1.45 | Dense metadata and secondary row text. |
| `caption` | 11-12px | 500-600 | 1.35 | Timestamps, table headers, chips. |
| `label` | 12-13px | 600 | 1.2 | Form labels, toolbar labels, metric labels. |

Rules:
- Money values use tabular numerals where possible.
- Table headers are small, semibold, muted, and not overly uppercase.
- Helper copy should remain readable for non-accountants and avoid technical accounting jargon.

## Spacing And Layout

The reference language is spacious at page and card level, compact inside data-heavy rows.

| Scale | Use |
| ---: | --- |
| `4` | Icon/text gaps, tiny chip padding. |
| `8` | Small row gaps, compact control groups. |
| `12` | Table cells, card internal subgroups. |
| `16` | Default component padding and row rhythm. |
| `20` | Card padding in dense dashboards. |
| `24` | Card padding in forms and major sections. |
| `32` | Section spacing. |
| `40` | Large form group spacing. |
| `48` | Hero/header spacing. |
| `64` | Full-section spacing on public/auth pages. |

Layout rules:
- Page containers should use a stable max width and responsive side padding.
- Dashboards use 12-column or responsive card grids.
- Dense finance pages use toolbars above tables, then cards/tables as the main surface.
- Mobile should stack cards and replace wide tables with card-like rows or horizontal scroll only where unavoidable.

## Component Patterns

### Cards

- Radius: large, usually `2xl`.
- Border: single subtle border.
- Shadow: very soft, never heavy.
- Header: title left, actions right; optional muted subtitle.
- Content: generous but consistent padding.
- Hover: subtle border tint and shadow lift for interactive cards.

### Tables

- White rounded container with subtle border.
- Header row is pale grey, compact, semibold.
- No zebra striping; rely on row dividers and hover state.
- Selected rows use soft violet or muted fill.
- Action column uses compact icon buttons or overflow menu.
- Status appears early enough to scan, but not before primary entity names.

### Buttons

- Primary: violet fill, white text, medium radius, slight hover lift.
- Secondary/outline: white card fill, border, subtle hover background.
- Ghost: no border, muted text, clear hover fill.
- Destructive: red fill or red text in destructive dialogs.
- Disabled: lower opacity and no hover transform.
- Loading: preserve width, show spinner or busy label.

### Inputs

- Rounded medium/large radius.
- White fill, subtle border, placeholder muted.
- Focus ring is violet and soft.
- Error state uses danger border/ring and helper text.
- Date/filter controls match button height and radius.

### Navigation

- Sidebar is white/card surface with subtle dividers.
- Active item uses soft violet background and violet text/icon.
- Icons are line-based and consistent size.
- Sections are grouped with small muted labels.
- Mobile navigation should collapse to sheet/drawer behaviour.

### Status Indicators

- Use pills/chips, not full-width colour blocks.
- `reconciled`, `posted`, `paid`, `complete`: success.
- `unmatched`, `needs_review`, `stale`, `warning`: warning.
- `failed`, `conflict`, `error`, `void`, `deleted`: danger.
- `submitted`, `processing`, `draft`: info/muted depending on urgency.

## Interaction Patterns

- Hover: subtle background, border tint, or shadow lift. Avoid dramatic motion.
- Focus: visible violet focus rings on all actionable controls.
- Transitions: 150-200ms, colour/shadow/transform only.
- Empty states: icon well, human title, plain-language guidance, one primary action.
- Error states: concise message, what happened, recovery action.
- Confirmation flows: destructive actions require clear title, consequence, and red destructive button.
- Loading: use skeletons for dashboards/tables and progressive loading for dense workflows.

## UI Principles

1. Finance clarity beats decoration.
2. Primary action is always obvious.
3. Every money value must communicate whether it is a balance, movement, or variance.
4. Dense pages use compact rhythm; forms use more breathing room.
5. Shared primitives should carry the visual system so pages do not hand-roll styling.
6. Status language should be readable for non-accountants.
7. Charts must explain a real operational metric.

## What Not To Copy Blindly

- Marketing hero blocks do not belong inside accounting workflows.
- Decorative chart colours must not override financial meaning.
- Huge metric typography should be avoided in dense finance contexts.
- Nested anchors, clickable cards with nested links, and ambiguous controls cause accessibility and hydration issues.
- Do not mix arbitrary Tailwind palette classes with semantic design tokens except in isolated chart series.
- Avoid replacing tables with cards where users need bulk scanning, filtering, and reconciliation.
