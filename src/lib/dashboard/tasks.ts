'use server';

import { createClient } from '@/lib/supabase/server';
import type { TodoItem } from '@/lib/reports/types';

type DashboardTaskStatus = 'active' | 'completed' | 'inactive';

interface DashboardTaskRow {
  id: string;
  workspace_id: string;
  task_key: string;
  title: string;
  description: string | null;
  href: string;
  type: TodoItem['type'];
  source_type: string;
  source_id: string | null;
  due_at: string | null;
  calendar_event_id: string | null;
  status: DashboardTaskStatus;
  completed_at: string | null;
  created_at: string | null;
}

const WRITER_ROLES = new Set(['admin', 'treasurer', 'finance_user']);

function canPersist(role?: string | null): boolean {
  return Boolean(role && WRITER_ROLES.has(role));
}

function defaultDueAt(index: number): string {
  const due = new Date();
  due.setHours(Math.min(17, 9 + index), 0, 0, 0);
  return due.toISOString();
}

function taskDescription(item: TodoItem): string {
  if (item.description) return item.description;
  if (/bank transaction|reconciliation/i.test(item.label)) return 'Keep bank activity matched before reports are trusted.';
  if (/budget/i.test(item.label)) return 'Review and approve budget changes for the current year.';
  if (/invoice|payment run|payroll/i.test(item.label)) return 'Complete the workflow so accounting records stay current.';
  if (/receipt/i.test(item.label)) return 'Attach evidence before month-end or trustee review.';
  if (/calendar|letting/i.test(item.label)) return 'Review operational follow-up linked to finance activity.';
  if (/gift aid/i.test(item.label)) return 'Review eligible giving and prepare the next claim.';
  return 'Open the linked workspace to review and resolve this item.';
}

function rowToTodo(row: DashboardTaskRow): TodoItem {
  return {
    id: row.id,
    key: row.task_key,
    label: row.title,
    href: row.href,
    type: row.type,
    description: row.description ?? undefined,
    dueAt: row.due_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    completedAt: row.completed_at,
    calendarEventId: row.calendar_event_id,
    createdAt: row.created_at,
  };
}

function candidateToTodo(item: TodoItem, index: number): TodoItem {
  return {
    ...item,
    description: taskDescription(item),
    dueAt: item.dueAt ?? defaultDueAt(index),
    sourceType: item.sourceType ?? 'dashboard',
    sourceId: item.sourceId ?? item.key,
    status: item.status ?? 'active',
  };
}

async function createCalendarEventForTask(params: {
  workspaceId: string;
  userId: string;
  task: DashboardTaskRow;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      workspace_id: params.workspaceId,
      title: params.task.title,
      description: params.task.description,
      category: params.task.type === 'warning' ? 'finance_deadline' : 'reminder',
      status: params.task.status === 'completed' ? 'completed' : 'scheduled',
      visibility: 'workspace',
      start_at: params.task.due_at ?? defaultDueAt(0),
      end_at: null,
      all_day: true,
      linked_source_type: 'workflow',
      linked_source_id: params.task.id,
      metadata: {
        source: 'dashboard_task',
        task_key: params.task.task_key,
      },
      created_by: params.userId,
      updated_by: params.userId,
    })
    .select('id')
    .single();

  if (error || !data?.id) return null;
  return data.id as string;
}

export async function syncDashboardTasks(params: {
  orgId: string;
  userId?: string | null;
  role?: string | null;
  items: TodoItem[];
}): Promise<TodoItem[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const candidates = params.items.map(candidateToTodo);
  const candidateKeys = new Set(candidates.map((item) => item.key));
  const mayWrite = canPersist(params.role) && Boolean(params.userId);

  try {
    const { data: existingData } = await supabase
      .from('dashboard_tasks')
      .select('*')
      .eq('workspace_id', params.orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    const existingRows = (existingData ?? []) as DashboardTaskRow[];
    const byKey = new Map(existingRows.map((row) => [row.task_key, row]));

    if (mayWrite && params.userId) {
      for (const candidate of candidates) {
        const existing = byKey.get(candidate.key);
        const status: DashboardTaskStatus = existing?.status === 'completed' ? 'completed' : 'active';
        const payload = {
          title: candidate.label,
          description: candidate.description ?? null,
          href: candidate.href,
          type: candidate.type,
          source_type: candidate.sourceType ?? 'dashboard',
          source_id: candidate.sourceId ?? null,
          due_at: candidate.dueAt ?? defaultDueAt(0),
          status,
          last_seen_at: now,
          ...(status === 'completed' ? {} : { completed_at: null, completed_by: null }),
        };

        if (existing) {
          await supabase
            .from('dashboard_tasks')
            .update(payload)
            .eq('workspace_id', params.orgId)
            .eq('id', existing.id);

          if (!existing.calendar_event_id) {
            const eventId = await createCalendarEventForTask({
              workspaceId: params.orgId,
              userId: params.userId,
              task: { ...existing, ...payload, due_at: payload.due_at },
            });
            if (eventId) {
              await supabase
                .from('dashboard_tasks')
                .update({ calendar_event_id: eventId })
                .eq('workspace_id', params.orgId)
                .eq('id', existing.id);
            }
          }
        } else {
          const { data: inserted } = await supabase
            .from('dashboard_tasks')
            .insert({
              workspace_id: params.orgId,
              task_key: candidate.key,
              ...payload,
              created_by: params.userId,
            })
            .select('*')
            .single();

          if (inserted) {
            const insertedTask = inserted as DashboardTaskRow;
            const eventId = await createCalendarEventForTask({
              workspaceId: params.orgId,
              userId: params.userId,
              task: insertedTask,
            });
            if (eventId) {
              await supabase
                .from('dashboard_tasks')
                .update({ calendar_event_id: eventId })
                .eq('workspace_id', params.orgId)
                .eq('id', insertedTask.id);
            }
          }
        }
      }

      const staleRows = existingRows.filter((row) => row.status === 'active' && !candidateKeys.has(row.task_key));
      await Promise.all(staleRows.map((row) =>
        supabase
          .from('dashboard_tasks')
          .update({ status: 'inactive', last_seen_at: now })
          .eq('workspace_id', params.orgId)
          .eq('id', row.id),
      ));
    }

    const { data: latestData, error: latestError } = await supabase
      .from('dashboard_tasks')
      .select('*')
      .eq('workspace_id', params.orgId)
      .in('status', ['active', 'completed', 'inactive'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (latestError) {
      return candidates;
    }

    const persisted = ((latestData ?? []) as DashboardTaskRow[]).map(rowToTodo);
    const persistedKeys = new Set(persisted.map((item) => item.key));
    const generatedFallbacks = candidates.filter((item) => !persistedKeys.has(item.key));

    return [...generatedFallbacks, ...persisted].slice(0, 30);
  } catch {
    return candidates;
  }
}
