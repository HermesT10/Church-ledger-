import type { Role } from '@/lib/permissions';

export interface InviteRow {
  id: string;
  organisationId: string;
  workspaceId: string;
  email: string;
  invitedEmail: string;
  invitedFullName: string | null;
  employeeId: string | null;
  role: Role;
  token: string | null;
  inviteCode: string;
  inviteUrl?: string;
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'revoked';
  permissionPresetId: string | null;
  expiresAt: string;
  createdBy: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalPermissionPreset {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  role: Role;
  permissions: Record<string, unknown>;
  isSystemPreset: boolean;
}

export interface PortalUserPermission {
  id: string;
  workspaceId: string;
  membershipId: string | null;
  userId: string | null;
  employeeId: string | null;
  permissionPresetId: string | null;
  permissions: Record<string, unknown>;
  assignedBudgetIds: string[];
  assignedFundIds: string[];
  linkedBankAccountIds: string[];
}

export interface UserBudgetAssignment {
  id: string;
  userId: string;
  budgetId: string;
  budgetCategoryId: string | null;
  canView: boolean;
  canSubmitAgainst: boolean;
  spendingLimit: number | null;
}

export interface UserFundAssignment {
  id: string;
  userId: string;
  fundId: string;
  canView: boolean;
  canSubmitAgainst: boolean;
}

export interface UserCategoryAssignment {
  id: string;
  userId: string;
  categoryId: string;
  canView: boolean;
  canSubmitAgainst: boolean;
}

export interface UserCardAssignment {
  id: string;
  userId: string;
  bankAccountId: string | null;
  cardName: string;
  lastFour: string | null;
  spendingLimit: number | null;
  status: 'active' | 'inactive' | 'archived';
}

export interface PortalAccessReference {
  id: string;
  name: string;
  label?: string;
}

export interface EmployeePortalAccessData {
  invites: InviteRow[];
  permission: PortalUserPermission | null;
  presets: PortalPermissionPreset[];
  budgets: PortalAccessReference[];
  budgetCategories: PortalAccessReference[];
  funds: PortalAccessReference[];
  categories: PortalAccessReference[];
  bankAccounts: PortalAccessReference[];
  budgetAssignments: UserBudgetAssignment[];
  fundAssignments: UserFundAssignment[];
  categoryAssignments: UserCategoryAssignment[];
  cardAssignments: UserCardAssignment[];
  recentActivity: {
    id: string;
    action: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
}
