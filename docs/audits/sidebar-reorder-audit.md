# Sidebar reorder audit (treasurer workflow)

## Scope

Audit of the main app sidebar: component wiring, navigation data, routes, role visibility, active-state rules, badges, icons, desktop collapse, and mobile sheet. Based on `src/components/app-sidebar.tsx`, `src/components/collapsible-layout.tsx`, and `src/components/mobile-sidebar.tsx`.

## Sidebar component(s)

| Component | Role |
|-----------|------|
| `src/components/app-sidebar.tsx` | **Single source of truth** for nav: `NAV_GROUPS` array, filtering, active state, section expand/collapse, badges, quick actions, collapsed flat list. |
| `src/components/collapsible-layout.tsx` | Desktop: fixed aside, `expanded` toggles `AppSidebar` `collapsed={!expanded}`, width/margin transitions (`transition-[width]` ~300ms). |
| `src/components/mobile-sidebar.tsx` | `Sheet` + `AppSidebar` with `collapsed={false}`, `onLinkClick` closes sheet. |

No separate `navigation.json` or shared nav module elsewhere (only `app-sidebar.tsx` defines `NAV_GROUPS`).

## Navigation config

- **Type**: `NavGroup[]` with `title`, optional `description` (section tooltip), and `NavItem[]`.
- **Item fields**: `label`, `href`, `icon` (Lucide), `roles: ReadonlySet<RoleKey>`, optional `matchPrefix` for nested active matching.
- **Role keys** (`RoleKey`): `admin` \| `treasurer` \| `finance_user` \| `trustee_viewer` \| `viewer` \| `auditor`.
- **Role sets**:
  - `EVERYONE`: all six roles.
  - `FINANCE_PLUS`: admin, treasurer, finance_user, auditor.
  - `TRUSTEE_PLUS`: admin, treasurer, finance_user, trustee_viewer, auditor.
  - `ADMIN_TREASURER_FINANCE`: admin, treasurer, finance_user.

Visibility: items filtered with `canSeeNavItem`; **groups with zero visible items are removed** (`visibleGroups`).

## Target sidebar structure (implemented)

1. **Overview** — Dashboard (`/dashboard`), Calendar (`/calendar`) — `EVERYONE`
2. **Banking** — Bank Accounts (`/banking`), Reconciliation (`/reconciliation`), Transactions (`/transactions`), Cash (`/cash`) — `FINANCE_PLUS`
3. **Income** — Income Register, Donations, Lettings, Gift Aid, Giving Platforms, Giving Imports — `FINANCE_PLUS`
4. **Expenses** — Expense Register, Suppliers, Invoices, Payment Runs, Payroll, Staff — `FINANCE_PLUS`
5. **Accounting** — Funds, Accounts, Journals — replaces former “Structure” label
6. **Planning** — Budgets, Month End — `TRUSTEE_PLUS` / `FINANCE_PLUS` per item
7. **Reports** — Reports only (`matchPrefix: '/reports'`) — `EVERYONE`
8. **Admin** — Workflows, Settings — `ADMIN_TREASURER_FINANCE`

## Route mapping

| Label | href | matchPrefix |
|-------|------|-------------|
| Dashboard | `/dashboard` | — |
| Calendar | `/calendar` | — |
| Bank Accounts | `/banking` | — |
| Reconciliation | `/reconciliation` | — |
| Transactions | `/transactions` | — |
| Cash | `/cash` | — |
| Income Register | `/income/register` | — |
| Donations | `/donations` | — |
| Lettings | `/lettings` | — |
| Gift Aid | `/gift-aid` | — |
| Giving Platforms | `/giving-platforms` | — |
| Giving Imports | `/giving-imports` | — |
| Expense Register | `/expenses/register` | — |
| Suppliers | `/suppliers` | — |
| Invoices | `/bills` | — |
| Payment Runs | `/payment-runs` | — |
| Payroll | `/payroll` | — |
| Staff | `/employees` | — |
| Funds | `/funds` | — |
| Accounts | `/accounts` | — |
| Journals | `/journals` | — |
| Budgets | `/budgets` | — |
| Month End | `/month-end` | — |
| Reports | `/reports` | `/reports` |
| Workflows | `/workflows` | `/workflows` |
| Settings | `/settings` | — |

## Permissions

- `roles` on each item unchanged from pre-reorder logic (only section ordering and labels changed).
- Trustee-heavy vs finance-heavy visibility preserved via the same sets.

## Active route highlighting

- With `matchPrefix`: `pathname.startsWith(matchPrefix)`.
- Else: `pathname === item.href || pathname.startsWith(item.href + '/')`.

Group headers reflect active descendant via `groupHasActiveItem`. Sections containing the current route auto-expand (`expandedState`).

## Section count badges

`group.items.length` after role filtering — counts **visible** items only. Empty groups omitted.

## Collapsed / expanded (desktop)

- **Expanded**: collapsible sections, chevron rotation, `max-h` / opacity ~200ms on item list.
- **Collapsed**: flat icon-only list in **`NAV_GROUPS` document order** (treasurer workflow order).

## Quick actions (expanded only)

Visible items with labels `Dashboard`, `Calendar`, `Reports`, `Settings`.

## Mobile

`MobileSidebar`: sheet width ~17.5rem; `onLinkClick` closes sheet.

## Implementation notes

- `localStorage` key: `sidebarNavGroups_v2` (avoids stale keys for renamed sections like Structure → Accounting).
- Section header `title` attribute set from optional `description` for light tooltips.

## Tests

`tests/sidebarTreasurerWorkflow.test.ts` asserts group order, key labels, `Bank Accounts`, `Accounting`, Reports in its own section, and `STORAGE_KEY` version.

## References

- `src/components/app-sidebar.tsx`
- `src/components/collapsible-layout.tsx`
- `src/components/mobile-sidebar.tsx`
