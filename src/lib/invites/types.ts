import type { Role } from '@/lib/permissions';

export interface InviteRow {
  id: string;
  organisationId: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
  createdBy: string | null;
  createdAt: string;
}
