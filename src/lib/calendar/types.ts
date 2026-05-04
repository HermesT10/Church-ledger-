export const CALENDAR_EVENT_CATEGORIES = [
  'general',
  'worship',
  'trustee_meeting',
  'letting',
  'finance_deadline',
  'payroll',
  'gift_aid',
  'month_end_close',
  'payment_run',
  'budget_review',
  'bank_reconciliation',
  'reminder',
] as const;

export type CalendarEventCategory = (typeof CALENDAR_EVENT_CATEGORIES)[number];

export const CALENDAR_CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  general: 'General',
  worship: 'Worship',
  trustee_meeting: 'Trustee meeting',
  letting: 'Letting',
  finance_deadline: 'Finance deadline',
  payroll: 'Payroll',
  gift_aid: 'Gift Aid',
  month_end_close: 'Month-end close',
  payment_run: 'Payment run',
  budget_review: 'Budget review',
  bank_reconciliation: 'Bank reconciliation',
  reminder: 'Reminder',
};

export const CALENDAR_EVENT_STATUSES = ['scheduled', 'tentative', 'cancelled', 'completed'] as const;
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

export const CALENDAR_STATUS_LABELS: Record<CalendarEventStatus, string> = {
  scheduled: 'Scheduled',
  tentative: 'Tentative',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const CALENDAR_VISIBILITIES = ['workspace', 'private', 'selected_users'] as const;
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number];

export const CALENDAR_VISIBILITY_LABELS: Record<CalendarVisibility, string> = {
  workspace: 'Workspace',
  private: 'Private',
  selected_users: 'Selected people',
};

export const CALENDAR_RECURRENCE_RULES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type CalendarRecurrenceRule = (typeof CALENDAR_RECURRENCE_RULES)[number];

export const CALENDAR_RECURRENCE_LABELS: Record<CalendarRecurrenceRule, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const CALENDAR_ATTENDEE_RESPONSES = ['pending', 'accepted', 'declined', 'tentative'] as const;
export type CalendarAttendeeResponse = (typeof CALENDAR_ATTENDEE_RESPONSES)[number];

export const CALENDAR_ATTENDEE_ROLES = ['organiser', 'attendee', 'optional'] as const;
export type CalendarAttendeeRole = (typeof CALENDAR_ATTENDEE_ROLES)[number];

export const CALENDAR_REMINDER_STATES = ['scheduled', 'sent', 'dismissed', 'completed', 'cancelled'] as const;
export type CalendarReminderState = (typeof CALENDAR_REMINDER_STATES)[number];

export interface CalendarResource {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  allow_double_booking: boolean;
  is_active: boolean;
}

export interface CalendarEventRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  category: CalendarEventCategory;
  status: CalendarEventStatus;
  visibility: CalendarVisibility;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  resource_id: string | null;
  recurrence_rule: CalendarRecurrenceRule;
  recurrence_until: string | null;
  linked_fund_id: string | null;
  linked_account_id: string | null;
  linked_source_type: string | null;
  linked_source_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  calendar_resources?: Pick<CalendarResource, 'id' | 'name' | 'allow_double_booking'> | null;
}

export interface CalendarAttendee {
  id: string;
  event_id: string;
  attendee_user_id: string | null;
  attendee_email: string | null;
  attendee_name: string | null;
  role: CalendarAttendeeRole;
  response: CalendarAttendeeResponse;
  notes: string | null;
}

export interface CalendarReminder {
  id: string;
  event_id: string | null;
  title: string;
  due_at: string;
  state: CalendarReminderState;
  assigned_to: string | null;
}

export interface CalendarEventLink {
  id: string;
  event_id: string;
  source_type: string;
  source_id: string;
  label: string | null;
  href: string | null;
}

export interface CalendarEventView {
  id: string;
  source: 'stored' | 'derived';
  title: string;
  description?: string | null;
  category: CalendarEventCategory;
  status: CalendarEventStatus;
  visibility?: CalendarVisibility;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  recurrenceRule?: CalendarRecurrenceRule;
  recurrenceUntil?: string | null;
  linkedFundId?: string | null;
  linkedAccountId?: string | null;
  linkedSourceType?: string | null;
  linkedSourceId?: string | null;
  href?: string | null;
  reminderCount?: number;
  attendeeCount?: number;
}

export interface CalendarEventDetail extends CalendarEventView {
  attendees: CalendarAttendee[];
  reminders: CalendarReminder[];
  links: CalendarEventLink[];
}

export interface CalendarRangeFilters {
  start: string;
  end: string;
  category?: CalendarEventCategory | 'all';
  status?: CalendarEventStatus | 'all';
  resourceId?: string | 'all';
  userId?: string | 'all';
  query?: string;
  includeFinance?: boolean;
  includeLettings?: boolean;
  includeReminders?: boolean;
}

export interface CalendarUser {
  id: string;
  name: string;
  role: string;
}

export interface CalendarActionResult<T = null> {
  data?: T;
  error?: string;
}
