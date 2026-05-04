'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, ChevronsUpDown } from 'lucide-react';
import type { UserOrganisationMembership } from '@/lib/org';
import { switchActiveOrganisation } from '@/lib/org-switching/actions';

interface OrgSwitcherProps {
  organisations: UserOrganisationMembership[];
  activeOrgId: string;
  compact?: boolean;
}

export function OrgSwitcher({
  organisations,
  activeOrgId,
  compact = false,
}: OrgSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (organisations.length <= 1) {
    return null;
  }

  return (
    <div className={compact ? 'px-2 py-2' : 'px-4 py-3 border-b border-sidebar-border'}>
      {!compact && (
        <p className="mb-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
          Workspace
        </p>
      )}

      <div className="relative">
        <Building2
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/50"
          aria-hidden="true"
        />
        <ChevronsUpDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/50"
          aria-hidden="true"
        />
        <select
          aria-label="Switch organisation"
          className="h-10 w-full appearance-none rounded-lg border border-sidebar-border bg-sidebar-accent/40 pl-9 pr-9 text-sm text-sidebar-foreground shadow-sm outline-none transition focus:border-sidebar-ring"
          value={activeOrgId}
          disabled={isPending}
          onChange={(event) => {
            const nextOrgId = event.target.value;
            startTransition(async () => {
              const result = await switchActiveOrganisation(nextOrgId);
              if (result.error) {
                toast.error(result.error);
                return;
              }

              toast.success('Workspace changed.');
              router.refresh();
            });
          }}
        >
          {organisations.map((organisation) => (
            <option key={organisation.orgId} value={organisation.orgId}>
              {organisation.orgName} ({organisation.role.replace('_', ' ')})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
