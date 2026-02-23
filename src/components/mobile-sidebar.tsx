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

interface MobileSidebarProps {
  userName: string;
  orgName: string;
  role: string;
}

export function MobileSidebar({ userName, orgName, role }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="p-1.5">
          <Menu size={20} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 bg-sidebar border-sidebar-border">
        <AppSidebar
          userName={userName}
          orgName={orgName}
          role={role}
          collapsed={false}
          onToggle={() => setOpen(false)}
          onLinkClick={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
