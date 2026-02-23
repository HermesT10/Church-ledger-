import { getActiveOrg } from '@/lib/org';
import { getConversation, markConversationRead } from '@/lib/workflows/messages';
import { ConversationClient } from './conversation-client';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { user } = await getActiveOrg();
  const { data, error } = await getConversation(conversationId);

  await markConversationRead(conversationId);

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error || 'Conversation not found.'}</p>
      </div>
    );
  }

  return (
    <ConversationClient
      conversation={data.conversation}
      initialMessages={data.messages}
      currentUserId={user.id}
    />
  );
}
