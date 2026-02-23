/* Audit log types (shared, not a server action file) */

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  environment: string;
  createdAt: string;
}

export interface AuditLogResult {
  data: AuditLogEntry[];
  total: number;
  error: string | null;
}
