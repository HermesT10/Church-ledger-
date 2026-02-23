import { getActiveOrg } from '@/lib/org';
import { listConversations } from '@/lib/workflows/messages';
import { MessagesClient } from './messages-client';

export default async function WorkflowMessagesPage() {
  const { orgId, role } = await getActiveOrg();
  const { data: conversations } = await listConversations(orgId);

  return <MessagesClient role={role} orgId={orgId} conversations={conversations} />;
}
