'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REFRESH_INTERVAL_MS = 45_000;

export function usePortalRefresh(userId: string, workspaceId: string) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const supabase = createClient();
    const channel = supabase
      .channel(`portal-dashboard:${workspaceId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_tasks', filter: `assigned_to=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_notifications', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_user_permissions', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_event_attendees', filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_submissions', filter: `submitted_by=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_submission_attachments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_collection_submissions', filter: `submitted_by=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_expense_submissions', filter: `submitted_by=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_budget_assignments', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_fund_assignments', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_category_assignments', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funds', filter: `organisation_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journals', filter: `organisation_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_lines', filter: `organisation_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_lines' }, refresh)
      .subscribe();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [router, userId, workspaceId]);
}
