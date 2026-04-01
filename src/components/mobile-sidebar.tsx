'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AppSidebar } from './app-sidebar';
import type { OrgOption } from '@/lib/org';

interface MobileSidebarProps {
  userName: string;
  currentOrgId: string;
  orgName: string;
  availableOrgs: OrgOption[];
  role: string;
}

export function MobileSidebar({
  userName,
  currentOrgId,
  orgName,
  availableOrgs,
  role,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon-sm" className="border-border/80 bg-card/90">
          <Menu size={20} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 rounded-r-[1.75rem] border-sidebar-border bg-sidebar/96 p-0 backdrop-blur-md">
        <AppSidebar
          userName={userName}
          currentOrgId={currentOrgId}
          orgName={orgName}
          availableOrgs={availableOrgs}
          role={role}
          collapsed={false}
          onToggle={() => setOpen(false)}
          onLinkClick={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
