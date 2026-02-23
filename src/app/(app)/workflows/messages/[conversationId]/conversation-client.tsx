'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { sendMessage } from '@/lib/workflows/messages';
import type { ConversationRow, MessageRow } from '@/lib/workflows/types';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ConversationClientProps {
  conversation: ConversationRow;
  initialMessages: MessageRow[];
  currentUserId: string;
}

export function ConversationClient({
  conversation,
  initialMessages,
  currentUserId,
}: ConversationClientProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [reply, setReply] = useState('');
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!reply.trim()) {
      toast.error('Message content is required.');
      return;
    }
    const content = reply.trim();
    setReply('');
    startTransition(async () => {
      const { data, error } = await sendMessage({
        conversationId: conversation.id,
        content,
      });
      if (error) {
        toast.error(error);
        setReply(content);
        return;
      }
      if (data) {
        setMessages((prev) => [...prev, data]);
      }
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/workflows/messages">
            <ArrowLeft className="size-4" />
            <span className="sr-only">Back to messages</span>
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">
            {conversation.subject || 'Conversation'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {conversation.creatorName ?? 'Unknown'}
          </p>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Send the first message.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  isOwn ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md',
                  )}
                >
                  {!isOwn && (
                    <p className="text-xs font-medium opacity-90 mb-1">
                      {msg.senderName ?? 'Unknown'}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                  <p
                    className={cn(
                      'text-xs mt-1',
                      isOwn ? 'opacity-80' : 'text-muted-foreground',
                    )}
                  >
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* Reply form */}
      <div className="border-t p-4 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            rows={2}
            className="flex-1 min-h-[44px] max-h-32 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          />
          <Button
            onClick={handleSend}
            disabled={isPending || !reply.trim()}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
          >
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
