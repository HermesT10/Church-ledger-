'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { IncomeStreamRow } from '@/lib/income-streams/types';
import { createIncomeStream, archiveIncomeStream } from '@/lib/income-streams/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function IncomeStreamsClient({
  streams,
  error,
  canManage,
}: {
  streams: IncomeStreamRow[];
  error: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add stream</CardTitle>
          <CardDescription>Short codes work well for bank rule matching.</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <form
              className="grid gap-3 sm:grid-cols-2"
              action={(fd) =>
                startTransition(async () => {
                  setNote(null);
                  const code = fd.get('code') as string;
                  const name = fd.get('name') as string;
                  const description = fd.get('description') as string;
                  const res = await createIncomeStream({
                    code,
                    name,
                    description: description || undefined,
                    defaultFundId: null,
                    defaultIncomeAccountId: null,
                  });
                  setNote(res.ok ? `Created ${code}.` : res.error ?? 'Failed');
                  if (res.ok) router.refresh();
                })
              }
            >
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="code">Code</Label>
                <Input id="code" name="code" placeholder="GIVING_SUN" required />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Sunday giving" required />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" name="description" placeholder="Tithes via card readers" />
              </div>
              <Button type="submit" className="sm:col-span-2 w-fit" disabled={pending}>
                {pending ? 'Saving…' : 'Create income stream'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Treasurer or admin access needed to edit income streams.
            </p>
          )}
          {note && <p className="text-sm text-muted-foreground mt-3">{note}</p>}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {streams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No streams yet — add Giving, Lettings, or Grants patterns you recognise on bank feeds.
                </TableCell>
              </TableRow>
            ) : (
              streams.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.code}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'active' ? 'secondary' : 'outline'}>{s.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {canManage && s.status === 'active' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          startTransition(async () => {
                            const r = await archiveIncomeStream(s.id);
                            setNote(r.ok ? `Archived ${s.code}` : r.error ?? '');
                            router.refresh();
                          })
                        }
                      >
                        Archive
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
