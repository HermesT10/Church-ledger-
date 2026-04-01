'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { switchActiveOrg } from '@/lib/org-actions';
import type { OrgOption } from '@/lib/org';

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
  currentOrgId: string;
  orgName: string;
  availableOrgs: OrgOption[];
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
  currentOrgId,
  orgName,
  availableOrgs,
  role,
  collapsed,
  onToggle,
  onLinkClick,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const typedRole = role as RoleKey;
  const [isSwitching, startTransition] = useTransition();

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

  const handleOrgChange = (nextOrgId: string) => {
    if (!nextOrgId || nextOrgId === currentOrgId) {
      return;
    }

    startTransition(async () => {
      const targetOrg = availableOrgs.find((org) => org.orgId === nextOrgId);
      const { error } = await switchActiveOrg(nextOrgId);

      if (error) {
        toast.error(error);
        return;
      }

      toast.success(
        targetOrg
          ? `Switched to ${targetOrg.orgName}.`
          : 'Organisation changed.',
      );
      router.refresh();
      onLinkClick?.();
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* ---- Header with toggle ---- */}
      <div
        className={`flex items-center border-b border-sidebar-border ${
          collapsed ? 'justify-center px-2 py-4' : 'gap-2.5 px-4 py-4'
        }`}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sidebar-border bg-white/80 text-sidebar-foreground/70 shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Expand sidebar"
          >
            <Menu size={20} />
          </button>
        ) : (
          <>
            <Logo size={32} />
            <div className="min-w-0 flex-1">
              <span className="block text-base font-semibold tracking-tight truncate">
                {orgName}
              </span>
              {availableOrgs.length > 1 && (
                <select
                  value={currentOrgId}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  disabled={isSwitching}
                  aria-label="Switch organisation"
                  className="mt-1 h-8 w-full rounded-lg border border-sidebar-border bg-white/78 px-2.5 text-[11px] font-medium text-sidebar-foreground/80 outline-none transition-colors hover:border-sidebar-foreground/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {availableOrgs.map((org) => (
                    <option key={org.orgId} value={org.orgId}>
                      {org.orgName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={onToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
          collapsed ? 'px-2 space-y-1.5' : 'px-3 space-y-4'
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
                  flex items-center justify-center rounded-2xl border border-transparent py-2.5 px-2 transition-colors
                  ${
                    active
                      ? 'border-primary/10 bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
                    w-full flex items-center justify-between rounded-xl px-3 py-1.5
                    text-[10px] uppercase tracking-widest font-semibold transition-colors
                    ${
                      hasActive
                        ? 'text-sidebar-foreground/70'
                        : 'text-sidebar-foreground/45 hover:text-sidebar-foreground/65'
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
                            flex items-center gap-3 rounded-2xl border border-transparent py-2.5 pl-4 pr-3 text-sm font-medium transition-colors
                            ${
                              active
                                ? 'border-primary/10 bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                                : 'text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6f5ef9] to-[#8c7cff] text-xs font-bold text-white shadow-[0_12px_24px_rgba(111,94,249,0.32)]">
              {initials}
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-white/72 px-3 py-3 shadow-sm">
            <Link
              href="/profile"
              onClick={onLinkClick}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6f5ef9] to-[#8c7cff] text-xs font-bold text-white shadow-[0_12px_24px_rgba(111,94,249,0.32)] transition-opacity hover:opacity-90"
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
