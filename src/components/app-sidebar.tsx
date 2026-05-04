'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Layers,
  BookOpen,
  FileText,
  Landmark,
  Coins,
  ArrowLeftRight,
  Truck,
  Receipt,
  Banknote,
  Gift,
  Heart,
  CreditCard,
  FileUp,
  BarChart3,
  TrendingUp,
  ClipboardList,
  Settings,
  Users,
  UserPlus,
  CalendarDays,
  Menu,
  PanelLeftClose,
  ChevronDown,
  ListChecks,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import type { UserOrganisationMembership } from '@/lib/org';
import { OrgSwitcher } from './org-switcher';

/* ------------------------------------------------------------------ */
/*  Role-based visibility tiers                                        */
/* ------------------------------------------------------------------ */

type RoleKey = 'admin' | 'treasurer' | 'finance_user' | 'trustee_viewer' | 'viewer' | 'auditor';

const EVERYONE: ReadonlySet<RoleKey> = new Set(['admin', 'treasurer', 'finance_user', 'trustee_viewer', 'viewer', 'auditor']);
const FINANCE_PLUS: ReadonlySet<RoleKey> = new Set(['admin', 'treasurer', 'finance_user', 'auditor']);
const TRUSTEE_PLUS: ReadonlySet<RoleKey> = new Set(['admin', 'treasurer', 'finance_user', 'trustee_viewer', 'auditor']);
const ADMIN_TREASURER_FINANCE: ReadonlySet<RoleKey> = new Set(['admin', 'treasurer', 'finance_user']);

/* ------------------------------------------------------------------ */
/*  Nav config types                                                   */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: ReadonlySet<RoleKey>;
  matchPrefix?: string;
}

interface NavGroup {
  title: string;
  /** Short tooltip on section header (expanded sidebar). */
  description?: string;
  items: NavItem[];
}

/* ------------------------------------------------------------------ */
/*  Grouped navigation config                                          */
/* ------------------------------------------------------------------ */

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    description: 'Your financial position and upcoming activity',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: EVERYONE },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays, roles: EVERYONE },
    ],
  },
  {
    title: 'Banking',
    description: 'Bank accounts, imports, reconciliation, and cash',
    items: [
      { label: 'Bank Accounts', href: '/banking', icon: Landmark, roles: FINANCE_PLUS },
      { label: 'Reconciliation', href: '/reconciliation', icon: ArrowLeftRight, roles: FINANCE_PLUS },
      { label: 'Transactions', href: '/transactions', icon: Receipt, roles: FINANCE_PLUS },
      { label: 'Cash', href: '/cash', icon: Coins, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Income',
    description: 'Donations, lettings, Gift Aid, and income tracking',
    items: [
      { label: 'Income Register', href: '/income/register', icon: ClipboardList, roles: FINANCE_PLUS },
      { label: 'Donations', href: '/donations', icon: Heart, roles: FINANCE_PLUS },
      { label: 'Lettings', href: '/lettings', icon: CalendarDays, roles: FINANCE_PLUS },
      { label: 'Gift Aid', href: '/gift-aid', icon: Gift, roles: FINANCE_PLUS },
      { label: 'Giving Platforms', href: '/giving-platforms', icon: CreditCard, roles: FINANCE_PLUS },
      { label: 'Giving Imports', href: '/giving-imports', icon: FileUp, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Expenses',
    description: 'Suppliers, invoices, payroll, and spending',
    items: [
      { label: 'Expense Register', href: '/expenses/register', icon: ClipboardList, roles: FINANCE_PLUS },
      { label: 'Suppliers', href: '/suppliers', icon: Truck, roles: FINANCE_PLUS },
      { label: 'Invoices', href: '/bills', icon: Receipt, roles: FINANCE_PLUS },
      { label: 'Payment Runs', href: '/payment-runs', icon: Banknote, roles: FINANCE_PLUS },
      { label: 'Payroll', href: '/payroll', icon: Users, roles: FINANCE_PLUS },
      { label: 'Staff', href: '/employees', icon: UserPlus, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Accounting',
    description: 'Funds, accounts, and journals',
    items: [
      { label: 'Funds', href: '/funds', icon: Layers, roles: TRUSTEE_PLUS },
      { label: 'Accounts', href: '/accounts', icon: BookOpen, roles: FINANCE_PLUS },
      { label: 'Journals', href: '/journals', icon: FileText, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Planning',
    description: 'Budgets and month-end controls',
    items: [
      { label: 'Budgets', href: '/budgets', icon: BarChart3, roles: TRUSTEE_PLUS },
      { label: 'Month End', href: '/month-end', icon: ListChecks, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Reports',
    description: 'Financial statements and trustee packs',
    items: [
      { label: 'Reports', href: '/reports', icon: TrendingUp, matchPrefix: '/reports', roles: EVERYONE },
    ],
  },
  {
    title: 'Admin',
    description: 'Workflows and configuration',
    items: [
      { label: 'Workflows', href: '/workflows', icon: ClipboardList, matchPrefix: '/workflows', roles: ADMIN_TREASURER_FINANCE },
      { label: 'Settings', href: '/settings', icon: Settings, roles: ADMIN_TREASURER_FINANCE },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Bumped when reorganising sections so saved expand/collapse state does not reference removed titles. */
const STORAGE_KEY = 'sidebarNavGroups_v2';

function canSeeNavItem(role: RoleKey, item: NavItem): boolean {
  return item.roles.has(role);
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname.startsWith(item.matchPrefix);
  }
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function groupHasActiveItem(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isItemActive(pathname, item));
}

function loadExpandedState(): Record<string, boolean> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return null;
}

function saveExpandedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function buildInitialExpanded(pathname: string): Record<string, boolean> {
  const saved = loadExpandedState();
  const result: Record<string, boolean> = {};

  for (const group of NAV_GROUPS) {
    const hasActive = groupHasActiveItem(pathname, group);

    if (saved && group.title in saved) {
      result[group.title] = hasActive ? true : saved[group.title];
    } else {
      result[group.title] = hasActive || group.title === 'Overview';
    }
  }

  return result;
}

function roleLabel(role: RoleKey): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'treasurer':
      return 'Treasurer';
    case 'finance_user':
      return 'Finance';
    case 'trustee_viewer':
      return 'Trustee';
    case 'auditor':
      return 'Auditor';
    default:
      return 'Viewer';
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AppSidebarProps {
  userName: string;
  orgName: string;
  activeOrgId: string;
  organisations: UserOrganisationMembership[];
  role: string;
  collapsed: boolean;
  onToggle: () => void;
  onLinkClick?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AppSidebar({
  userName,
  orgName,
  activeOrgId,
  organisations,
  role,
  collapsed,
  onToggle,
  onLinkClick,
}: AppSidebarProps) {
  const pathname = usePathname();
  const typedRole = role as RoleKey;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    buildInitialExpanded(pathname),
  );

  const expandedState = useMemo(() => {
    const next = { ...expanded };
    for (const group of NAV_GROUPS) {
      if (groupHasActiveItem(pathname, group)) {
        next[group.title] = true;
      }
    }
    return next;
  }, [expanded, pathname]);

  const toggleGroup = useCallback((title: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      saveExpandedState(next);
      return next;
    });
  }, []);

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNavItem(typedRole, item)),
    }))
    .filter((group) => group.items.length > 0);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const quickActions = allVisibleItems.filter((item) =>
    ['Dashboard', 'Calendar', 'Reports', 'Settings'].includes(item.label),
  );

  const initials = (userName || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* ---- Premium workspace header ---- */}
      <div
        className={`border-b border-sidebar-border/70 ${
          collapsed ? 'px-2 py-3' : 'px-3 py-3'
        }`}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-sidebar-border/80 bg-gradient-to-br from-sidebar-primary to-chart-2 text-sidebar-primary-foreground shadow-card transition-transform hover:scale-[1.02]"
            title="Expand sidebar"
          >
            <Menu size={20} />
          </button>
        ) : (
          <div className="rounded-2xl border border-sidebar-border/80 bg-gradient-to-br from-surface-raised via-sidebar to-sidebar-accent/20 p-3 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/80 shadow-sm ring-1 ring-sidebar-border/70">
                <Logo size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground/70">
                  Workspace
                </p>
                <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                  {orgName}
                </p>
              </div>
              <button
                onClick={onToggle}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border/70 bg-background/50 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="rounded-full border border-sidebar-border/70 bg-background/55 px-2.5 py-1 text-xs font-medium text-sidebar-foreground">
                {roleLabel(typedRole)}
              </span>
              <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_16%,transparent)]" />
            </div>
          </div>
        )}
      </div>

      <div className={collapsed ? 'px-2 py-3' : 'px-3 py-3'}>
        <OrgSwitcher
          organisations={organisations}
          activeOrgId={activeOrgId}
          compact={collapsed}
        />
      </div>

      {!collapsed && quickActions.length > 0 && (
        <div className="border-y border-sidebar-border/60 px-3 py-3">
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={`quick-${item.href}`}
                  href={item.href}
                  onClick={onLinkClick}
                  title={item.label}
                  className={`
                    flex h-11 items-center justify-center rounded-xl border text-sidebar-foreground transition-all
                    ${
                      active
                        ? 'border-sidebar-primary/30 bg-sidebar-accent shadow-sm ring-1 ring-sidebar-primary/10'
                        : 'border-sidebar-border/70 bg-surface-muted/55 hover:border-sidebar-primary/30 hover:bg-sidebar-accent/60'
                    }
                  `}
                >
                  <Icon size={17} />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Navigation ---- */}
      <nav
        className={`flex-1 overflow-y-auto py-3 [scrollbar-width:thin] ${
          collapsed ? 'space-y-1.5 px-2' : 'space-y-3 px-3'
        }`}
      >
        {collapsed ? (
          /* Collapsed: flat icon-only list */
          allVisibleItems.map((item) => {
            const active = isItemActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onLinkClick}
                title={item.label}
                className={`
                  flex items-center justify-center rounded-xl border px-2 py-2.5 text-sidebar-foreground transition-all
                  ${
                    active
                      ? 'border-sidebar-primary/25 bg-sidebar-accent shadow-sm ring-1 ring-sidebar-primary/10'
                      : 'border-transparent hover:border-sidebar-border/80 hover:bg-sidebar-accent/50'
                  }
                `}
              >
                <Icon size={18} className="shrink-0" />
              </Link>
            );
          })
        ) : (
          /* Expanded: grouped collapsible sections */
          visibleGroups.map((group) => {
            const isExpanded = expandedState[group.title] ?? true;
            const hasActive = groupHasActiveItem(pathname, group);

            return (
              <div
                key={group.title}
                className="rounded-2xl border border-transparent px-1 py-1 transition-colors hover:border-sidebar-border/40 hover:bg-surface-muted/25"
              >
                {/* Group heading */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isExpanded}
                  title={group.description}
                  className={`
                    flex w-full items-center justify-between rounded-xl px-3 py-2
                    text-sm font-medium text-sidebar-foreground transition-colors
                    ${
                      hasActive
                        ? 'bg-sidebar-accent/45'
                        : 'hover:bg-sidebar-accent/30'
                    }
                  `}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{group.title}</span>
                    <span className="rounded-full border border-sidebar-border/60 bg-background/45 px-1.5 py-0.5 text-xs font-medium tabular-nums text-sidebar-foreground">
                      {group.items.length}
                    </span>
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted/70 text-sidebar-foreground">
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform duration-200 ${
                        isExpanded ? '' : '-rotate-90'
                      }`}
                    />
                  </span>
                </button>

                {/* Group items */}
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isItemActive(pathname, item);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onLinkClick}
                          className={`
                            relative flex items-center gap-3 rounded-xl border py-2.5 pl-3 pr-3 text-sm font-medium leading-tight text-sidebar-foreground transition-all
                            before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:transition-opacity
                            ${
                              active
                                ? 'border-sidebar-primary/25 bg-sidebar-accent shadow-sm ring-1 ring-sidebar-primary/10 before:bg-sidebar-primary before:opacity-100'
                                : 'border-transparent before:opacity-0 hover:border-sidebar-border/60 hover:bg-sidebar-accent/45'
                            }
                          `}
                        >
                          <span
                            className={`
                              flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors
                              ${
                                active
                                  ? 'bg-background/70 shadow-sm'
                                  : 'bg-surface-muted/60'
                              }
                            `}
                          >
                            <Icon size={16} className="shrink-0" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>

      {/* ---- User and controls footer ---- */}
      <div
        className={`border-t border-sidebar-border/70 ${
          collapsed ? 'space-y-3 px-2 py-3' : 'space-y-3 px-3 py-3'
        }`}
      >
        {collapsed ? (
          <>
            <div className="flex justify-center">
              <ThemeToggle collapsed={collapsed} />
            </div>
            <Link
              href="/profile"
              onClick={onLinkClick}
              className="flex justify-center"
              title={userName || 'User'}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-chart-2 to-chart-1 text-xs font-bold text-white shadow-card">
                {initials}
              </div>
            </Link>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-sidebar-border/80 bg-surface-muted/70 p-2 shadow-card">
              <ThemeToggle collapsed={collapsed} />
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border/80 bg-gradient-to-br from-surface-raised to-surface-muted/80 p-2.5 shadow-card">
              <Link
                href="/profile"
                onClick={onLinkClick}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-chart-2 to-chart-1 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                {initials}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href="/profile"
                  onClick={onLinkClick}
                  className="block truncate text-sm font-medium text-sidebar-foreground transition-colors hover:opacity-80"
                >
                  {userName || 'User'}
                </Link>
                <p className="truncate text-xs font-medium text-sidebar-foreground/70">{roleLabel(typedRole)}</p>
              </div>
              {ADMIN_TREASURER_FINANCE.has(typedRole) && (
                <Link
                  href="/settings"
                  onClick={onLinkClick}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border/70 bg-background/50 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                  title="Settings"
                >
                  <Settings size={16} />
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
