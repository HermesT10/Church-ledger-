'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { createReminder } from '@/lib/calendar/actions';

export function CalendarReminderQuickSheet({
  defaultDueLocal,
  cancelHref,
}: {
  defaultDueLocal: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Sheet defaultOpen>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add reminder</SheetTitle>
          <SheetDescription>Set a due date and title. This stays on your workspace calendar.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 grid gap-4 px-1 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            startTransition(async () => {
              const fd = new FormData(form);
              const result = await createReminder(fd);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success('Reminder created.');
              router.push(cancelHref);
              router.refresh();
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="rq-title">Title</Label>
            <Input id="rq-title" name="title" placeholder="Reminder title" required autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-due">Due</Label>
            <Input
              id="rq-due"
              name="due_at"
              type="datetime-local"
              required
              defaultValue={defaultDueLocal}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Create reminder'}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
