import Link from 'next/link';
import { Bell, CalendarClock, Landmark, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type ChooserChoice = {
  href: string;
  title: string;
  description: string;
  icon: typeof CalendarClock;
};

export function CalendarChooserSheet({
  headline,
  subtitle,
  cancelHref,
  choices,
}: {
  headline: string;
  subtitle: string;
  cancelHref: string;
  choices: ChooserChoice[];
}) {
  return (
    <Sheet defaultOpen>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{headline}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid gap-3 px-1 pb-6">
          {choices.map((choice) => {
            const Icon = choice.icon;
            return (
            <Link key={choice.href} href={choice.href} className="block rounded-2xl transition hover:opacity-95">
              <Card className={cn('rounded-2xl border-border/70 shadow-xs transition hover:border-primary/35 hover:bg-accent/25')}>
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base leading-tight">{choice.title}</CardTitle>
                    <CardDescription className="text-xs leading-snug">{choice.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            );
          })}
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const CALENDAR_CHOOSER_ICONS = {
  event: CalendarClock,
  reminder: Bell,
  letting: Landmark,
  finance: PiggyBank,
} as const;
