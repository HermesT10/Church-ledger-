'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { ConversationRow, MessageRow } from './types';

/* ------------------------------------------------------------------ */
/*  createConversation                                                 */
/* ------------------------------------------------------------------ */

export async function createConversation(params: {
  subject?: string | null;
  firstMessage: string;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'conversations');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  if (!params.firstMessage?.trim()) {
    return { data: null, error: 'Message content is required.' };
  }

  const admin = createAdminClient();

  // 1. Create conversation
  const { data: conv, error: convErr } = await admin
    .from('conversations')
    .insert({
      organisation_id: orgId,
      subject: params.subject?.trim() || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (convErr || !conv) return { data: null, error: convErr?.message ?? 'Failed to create conversation.' };

  // 2. Add creator as participant
  await admin.from('conversation_participants').insert({
    conversation_id: conv.id,
    user_id: user.id,
  });

  // 3. Add all org admins as participants
  const { data: admins } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .eq('role', 'admin');

  if (admins) {
    const adminInserts = admins
      .filter((a) => a.user_id !== user.id)
      .map((a) => ({
        conversation_id: conv.id,
        user_id: a.user_id,
      }));

    if (adminInserts.length > 0) {
      await admin.from('conversation_participants').insert(adminInserts);
    }
  }

  // 4. Insert first message
  await admin.from('messages').insert({
    conversation_id: conv.id,
    sender_id: user.id,
    content: params.firstMessage.trim(),
  });

  // 5. Mark as read for the creator
  await admin.from('message_reads').insert({
    conversation_id: conv.id,
    user_id: user.id,
    last_read_at: new Date().toISOString(),
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_conversation',
    entityType: 'conversation',
    entityId: conv.id,
  });

  return { data: { id: conv.id }, error: null };
}

/* ------------------------------------------------------------------ */
/*  listConversations                                                  */
/* ------------------------------------------------------------------ */

export async function listConversations(
  orgId: string,
): Promise<{ data: ConversationRow[]; error: string | null }> {
  const { role, user } = await getActiveOrg();
  const supabase = await createClient();

  // Get conversations the user participates in
  let conversationIds: string[] = [];

  if (role === 'admin') {
    // Admins see all org conversations
    const { data: allConvs } = await supabase
      .from('conversations')
      .select('id')
      .eq('organisation_id', orgId);
    conversationIds = (allConvs ?? []).map((c) => c.id);
  } else {
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);
    conversationIds = (parts ?? []).map((p) => p.conversation_id);
  }

  if (conversationIds.length === 0) return { data: [], error: null };

  // Fetch conversations with creator
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('*, creator:profiles!conversations_created_by_fkey(full_name)')
    .in('id', conversationIds)
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false });

  if (convErr) return { data: [], error: convErr.message };

  // Get read positions
  const { data: reads } = await supabase
    .from('message_reads')
    .select('conversation_id, last_read_at')
    .eq('user_id', user.id)
    .in('conversation_id', conversationIds);

  const readMap = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at]));

  // Build rows with last message and unread count
  const rows: ConversationRow[] = [];

  for (const conv of convs ?? []) {
    const creator = conv.creator as { full_name: string | null } | null;
    const lastRead = readMap.get(conv.id);

    // Get last message
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastMsg = lastMsgs?.[0];

    // Count unread
    let unreadCount = 0;
    if (lastRead) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', user.id)
        .gt('created_at', lastRead);
      unreadCount = count ?? 0;
    } else {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', user.id);
      unreadCount = count ?? 0;
    }

    // Count participants
    const { count: partCount } = await supabase
      .from('conversation_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id);

    rows.push({
      id: conv.id,
      organisationId: conv.organisation_id,
      subject: conv.subject,
      createdBy: conv.created_by,
      creatorName: creator?.full_name ?? null,
      participantCount: partCount ?? 0,
      unreadCount,
      lastMessagePreview: lastMsg?.content?.slice(0, 100) ?? null,
      lastMessageAt: lastMsg?.created_at ?? null,
      createdAt: conv.created_at,
    });
  }

  // Sort by last message date (most recent first)
  rows.sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  getConversation                                                    */
/* ------------------------------------------------------------------ */

export async function getConversation(
  conversationId: string,
): Promise<{ data: { conversation: ConversationRow; messages: MessageRow[] } | null; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();

  // Verify access
  if (role !== 'admin') {
    const { data: part } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!part) return { data: null, error: 'You are not a participant of this conversation.' };
  }

  // Fetch conversation
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('*, creator:profiles!conversations_created_by_fkey(full_name)')
    .eq('id', conversationId)
    .eq('organisation_id', orgId)
    .single();

  if (convErr || !conv) return { data: null, error: 'Conversation not found.' };

  // Fetch messages
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(full_name)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (msgErr) return { data: null, error: msgErr.message };

  const creator = conv.creator as { full_name: string | null } | null;

  const conversationRow: ConversationRow = {
    id: conv.id,
    organisationId: conv.organisation_id,
    subject: conv.subject,
    createdBy: conv.created_by,
    creatorName: creator?.full_name ?? null,
    participantCount: 0,
    unreadCount: 0,
    lastMessagePreview: null,
    lastMessageAt: null,
    createdAt: conv.created_at,
  };

  const messageRows: MessageRow[] = (msgs ?? []).map((m: Record<string, unknown>) => {
    const sender = m.sender as { full_name: string | null } | null;
    return {
      id: m.id as string,
      conversationId: m.conversation_id as string,
      senderId: m.sender_id as string,
      senderName: sender?.full_name ?? null,
      content: m.content as string,
      attachmentUrl: (m.attachment_url as string) ?? null,
      createdAt: m.created_at as string,
    };
  });

  return { data: { conversation: conversationRow, messages: messageRows }, error: null };
}

/* ------------------------------------------------------------------ */
/*  sendMessage                                                        */
/* ------------------------------------------------------------------ */

export async function sendMessage(params: {
  conversationId: string;
  content: string;
  attachmentUrl?: string | null;
}): Promise<{ data: MessageRow | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'conversations');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  if (!params.content?.trim()) return { data: null, error: 'Message content is required.' };

  const supabase = await createClient();

  // Verify participation (or admin)
  if (role !== 'admin') {
    const { data: part } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', params.conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!part) return { data: null, error: 'You are not a participant of this conversation.' };
  }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversationId,
      sender_id: user.id,
      content: params.content.trim(),
      attachment_url: params.attachmentUrl ?? null,
    })
    .select('*')
    .single();

  if (error || !msg) return { data: null, error: error?.message ?? 'Failed to send message.' };

  // Update sender's read position
  await supabase.from('message_reads').upsert(
    {
      conversation_id: params.conversationId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,user_id' },
  );

  // Get sender name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  return {
    data: {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      senderName: profile?.full_name ?? null,
      content: msg.content,
      attachmentUrl: msg.attachment_url,
      createdAt: msg.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  markConversationRead                                               */
/* ------------------------------------------------------------------ */

export async function markConversationRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const { user } = await getActiveOrg();
  const supabase = await createClient();

  const { error } = await supabase.from('message_reads').upsert(
    {
      conversation_id: conversationId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,user_id' },
  );

  return { error: error?.message ?? null };
}
