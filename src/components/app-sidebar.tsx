'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Menu,
  PanelLeftClose,
  ChevronDown,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';

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
  items: NavItem[];
}

/* ------------------------------------------------------------------ */
/*  Grouped navigation config                                          */
/* ------------------------------------------------------------------ */

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: EVERYONE },
    ],
  },
  {
    title: 'Structure',
    items: [
      { label: 'Funds', href: '/funds', icon: Layers, roles: TRUSTEE_PLUS },
      { label: 'Accounts', href: '/accounts', icon: BookOpen, roles: FINANCE_PLUS },
      { label: 'Journals', href: '/journals', icon: FileText, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Income',
    items: [
      { label: 'Donations', href: '/donations', icon: Heart, roles: FINANCE_PLUS },
      { label: 'Gift Aid', href: '/gift-aid', icon: Gift, roles: FINANCE_PLUS },
      { label: 'Giving Platforms', href: '/giving-platforms', icon: CreditCard, roles: FINANCE_PLUS },
      { label: 'Giving Imports', href: '/giving-imports', icon: FileUp, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Expenses',
    items: [
      { label: 'Suppliers', href: '/suppliers', icon: Truck, roles: FINANCE_PLUS },
      { label: 'Invoices', href: '/bills', icon: Receipt, roles: FINANCE_PLUS },
      { label: 'Payment Runs', href: '/payment-runs', icon: Banknote, roles: FINANCE_PLUS },
      { label: 'Employees', href: '/employees', icon: UserPlus, roles: FINANCE_PLUS },
      { label: 'Payroll', href: '/payroll', icon: Users, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Banking',
    items: [
      { label: 'Banking', href: '/banking', icon: Landmark, roles: FINANCE_PLUS },
      { label: 'Cash', href: '/cash', icon: Coins, roles: FINANCE_PLUS },
      { label: 'Reconciliation', href: '/reconciliation', icon: ArrowLeftRight, roles: FINANCE_PLUS },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Budgets', href: '/budgets', icon: BarChart3, roles: TRUSTEE_PLUS },
      { label: 'Reports', href: '/reports', icon: TrendingUp, matchPrefix: '/reports', roles: EVERYONE },
    ],
  },
  {
    title: 'Approvals',
    items: [
      { label: 'Workflows', href: '/workflows', icon: ClipboardList, matchPrefix: '/workflows', roles: ADMIN_TREASURER_FINANCE },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings, roles: ADMIN_TREASURER_FINANCE },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'sidebarNavGroups';

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
      result[group.title] = hasActive ? true : true;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AppSidebarProps {
  userName: string;
  orgName: string;
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

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const group of NAV_GROUPS) {
        if (groupHasActiveItem(pathname, group) && !next[group.title]) {
          next[group.title] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

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

  const initials = (userName || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground overflow-hidden">
      {/* ---- Header with toggle ---- */}
      <div
        className={`flex items-center border-b border-sidebar-border ${
          collapsed ? 'justify-center px-2 py-4' : 'gap-2.5 px-4 py-4'
        }`}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            title="Expand sidebar"
          >
            <Menu size={20} />
          </button>
        ) : (
          <>
            <Logo size={32} />
            <span className="flex-1 text-base font-semibold tracking-tight truncate">
              {orgName}
            </span>
            <button
              onClick={onToggle}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors shrink-0"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </>
        )}
      </div>

      {/* ---- Navigation ---- */}
      <nav
        className={`flex-1 overflow-y-auto py-3 ${
          collapsed ? 'px-2 space-y-1' : 'px-3 space-y-4'
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
                  flex items-center justify-center rounded-lg py-2.5 px-2 transition-colors
                  ${
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
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
            const isExpanded = expanded[group.title] ?? true;
            const hasActive = groupHasActiveItem(pathname, group);

            return (
              <div key={group.title}>
                {/* Group heading */}
                <button
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isExpanded}
                  className={`
                    w-full flex items-center justify-between rounded-md px-3 py-1.5
                    text-[10px] uppercase tracking-widest font-semibold transition-colors
                    ${
                      hasActive
                        ? 'text-sidebar-foreground/70'
                        : 'text-sidebar-foreground/40 hover:text-sidebar-foreground/60'
                    }
                  `}
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${
                      isExpanded ? '' : '-rotate-90'
                    }`}
                  />
                </button>

                {/* Group items */}
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isItemActive(pathname, item);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onLinkClick}
                          className={`
                            flex items-center gap-3 rounded-lg py-2 pl-5 pr-3 text-sm font-medium transition-colors
                            ${
                              active
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                            }
                          `}
                        >
                          <Icon size={16} className="shrink-0" />
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

      {/* ---- Theme toggle ---- */}
      <div
        className={`border-t border-sidebar-border py-3 ${
          collapsed ? 'px-2 flex justify-center' : 'px-4'
        }`}
      >
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* ---- User footer ---- */}
      <div
        className={`border-t border-sidebar-border py-4 ${
          collapsed ? 'px-2' : 'px-4'
        }`}
      >
        {collapsed ? (
          <Link
            href="/profile"
            onClick={onLinkClick}
            className="flex justify-center"
            title={userName || 'User'}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow">
              {initials}
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              onClick={onLinkClick}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow shrink-0 hover:opacity-90 transition-opacity"
            >
              {initials}
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                href="/profile"
                onClick={onLinkClick}
                className="text-sm font-medium truncate block hover:text-sidebar-foreground/90 transition-colors"
              >
                {userName || 'User'}
              </Link>
            </div>
            {ADMIN_TREASURER_FINANCE.has(typedRole) && (
              <Link
                href="/settings"
                onClick={onLinkClick}
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              >
                <Settings size={16} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
