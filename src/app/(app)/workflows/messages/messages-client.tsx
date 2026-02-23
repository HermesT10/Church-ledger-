'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { createConversation } from '@/lib/workflows/messages';
import type { ConversationRow } from '@/lib/workflows/types';
import { toast } from 'sonner';
import { MessageSquarePlus } from 'lucide-react';

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface MessagesClientProps {
  role: string;
  orgId: string;
  conversations: ConversationRow[];
}

export function MessagesClient({ role, orgId, conversations }: MessagesClientProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!firstMessage.trim()) {
      toast.error('Message content is required.');
      return;
    }
    startTransition(async () => {
      const { data, error } = await createConversation({
        subject: subject.trim() || null,
        firstMessage: firstMessage.trim(),
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Conversation created.');
      setOpen(false);
      setSubject('');
      setFirstMessage('');
      if (data?.id) {
        router.push(`/workflows/messages/${data.id}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <MessageSquarePlus className="size-4" />
              New Conversation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Conversation</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject (optional)</Label>
                <Input
                  id="subject"
                  placeholder="e.g. Invoice query"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">First message (required)</Label>
                <Textarea
                  id="message"
                  placeholder="Type your message..."
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {conversations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-sm">No conversations yet.</p>
              <p className="text-muted-foreground text-sm mt-1">
                Start a new conversation to message your organisation admins.
              </p>
            </CardContent>
          </Card>
        ) : (
          conversations.map((conv) => (
            <Link key={conv.id} href={`/workflows/messages/${conv.id}`}>
              <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-medium">
                    {conv.subject || (conv.lastMessagePreview ?? 'No subject').slice(0, 50)}
                    {!conv.subject && (conv.lastMessagePreview?.length ?? 0) > 50 ? '...' : ''}
                  </CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {conv.unreadCount > 0 && (
                      <Badge variant="secondary">{conv.unreadCount}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(conv.lastMessageAt ?? conv.createdAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">
                    {conv.creatorName ?? 'Unknown'} · {conv.lastMessagePreview ?? '—'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
