'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import type { UserOrganisationMembership } from '@/lib/org';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AppSidebar } from './app-sidebar';

interface MobileSidebarProps {
  userName: string;
  orgName: string;
  activeOrgId: string;
  organisations: UserOrganisationMembership[];
  role: string;
}

export function MobileSidebar({
  userName,
  orgName,
  activeOrgId,
  organisations,
  role,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="p-1.5">
          <Menu size={20} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[17.5rem] p-0 bg-sidebar border-sidebar-border">
        <AppSidebar
          userName={userName}
          orgName={orgName}
          activeOrgId={activeOrgId}
          organisations={organisations}
          role={role}
          collapsed={false}
          onToggle={() => setOpen(false)}
          onLinkClick={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
