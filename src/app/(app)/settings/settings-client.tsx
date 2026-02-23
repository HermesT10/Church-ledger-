'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Settings,
  Users,
  Calculator,
  BarChart3,
  Bell,
  Shield,
  Database,
  Info,
  Trash2,
  Lock,
  FlaskConical,
  HardDrive,
  Mail,
  UserMinus,
  UserCheck,
  RotateCcw,
  Send,
  Landmark,
  AlertTriangle,
} from 'lucide-react';
import {
  updateOrgName,
  updateOrgSettings,
  changeMemberRole,
  removeMember,
  disableMember,
  enableMember,
  changePassword,
  forceLogoutAll,
  setMemberExpiry,
  archiveBankAccount,
  resetMyWorkspace,
  createDataErasureRequest,
  listBankAccounts,
} from './actions';
import { sendInvite, listInvites, revokeInvite, resendInvite } from '@/lib/invites/actions';
import type { InviteRow } from '@/lib/invites/types';
import { ALL_ROLES, ROLE_LABELS as PERM_ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import type { OrgSettings, MemberRow } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { getAppEnv, isProduction } from '@/lib/env';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

const ROLE_LABELS: Record<string, string> = { ...PERM_ROLE_LABELS };

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  orgId: string;
  role: string;
  currentUserId: string;
  settings: OrgSettings | null;
  members: MemberRow[];
  invites: InviteRow[];
  bankAccounts: { id: string; name: string; account_number_last4: string | null; status: string }[];
  liabilityAccounts: { id: string; code: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
  incomeAccounts: { id: string; code: string; name: string }[];
  funds: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SettingsClient({
  orgId,
  role,
  currentUserId,
  settings: initialSettings,
  members: initialMembers,
  invites: initialInvites,
  bankAccounts,
  liabilityAccounts,
  expenseAccounts,
  incomeAccounts,
  funds,
}: Props) {
  const router = useRouter();
  const canEdit = role === 'admin' || role === 'treasurer';
  const isAdmin = role === 'admin';

  // Local state for form fields
  const [orgName, setOrgName] = useState(initialSettings?.organisationName ?? '');
  const [s, setS] = useState<OrgSettings>(
    initialSettings ?? {
      organisationName: '',
      overspendAmountPence: 5000,
      overspendPercent: 20,
      fiscalYearStartMonth: 1,
      timezone: 'Europe/London',
      dateFormat: 'DD/MM/YYYY',
      defaultBankAccountId: null,
      defaultCreditorsAccountId: null,
      forecastRiskTolerancePence: 5000,
      requireFundOnJournalLines: false,
      allowFundLevelBudgets: true,
      emailNotifications: true,
      overspendAlertNotifications: true,
      monthEndReminder: true,
      payrollSalariesAccountId: null,
      payrollErNicAccountId: null,
      payrollPensionAccountId: null,
      payrollPayeNicLiabilityId: null,
      payrollPensionLiabilityId: null,
      payrollNetPayLiabilityId: null,
      giftAidIncomeAccountId: null,
      giftAidBankAccountId: null,
      giftAidDefaultFundId: null,
      giftAidUseProportionalFunds: true,
      cashInHandAccountId: null,
      defaultDonationsIncomeAccountId: null,
      defaultDonationsBankAccountId: null,
      defaultDonationsFeeAccountId: null,
      receiptComplianceDays: 7,
    },
  );

  const [members] = useState(initialMembers);
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');

  // Confirmation dialog state
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{ open: boolean; userId: string | null }>({ open: false, userId: null });
  const [logoutDialog, setLogoutDialog] = useState(false);
  const [showArchivedBanks, setShowArchivedBanks] = useState(false);
  const [archiveBankDialog, setArchiveBankDialog] = useState<{ open: boolean; bankId: string | null; bankName: string }>({ open: false, bankId: null, bankName: '' });
  const [resetWorkspaceDialog, setResetWorkspaceDialog] = useState(false);
  const [erasureRequestDialog, setErasureRequestDialog] = useState(false);
  const [bankAccountsList, setBankAccountsList] = useState(bankAccounts);
  const [erasureScope, setErasureScope] = useState<'personal' | 'church'>('personal');
  const [erasureReason, setErasureReason] = useState('');
  const [erasureConfirmInput, setErasureConfirmInput] = useState('');

  const [isPending, startTransition] = useTransition();

  /* ---- Save helpers ---- */
  const saveOrgName = () => {
    startTransition(async () => {
      const { error } = await updateOrgName(orgId, orgName);
      if (error) toast.error(error);
      else {
        toast.success('Organisation name updated.');
        router.refresh();
      }
    });
  };

  const saveOrgSettings = (
    fields: Parameters<typeof updateOrgSettings>[1],
  ) => {
    startTransition(async () => {
      const { error } = await updateOrgSettings(orgId, fields);
      if (error) toast.error(error);
      else toast.success('Settings saved.');
    });
  };

  const handleChangeRole = (userId: string, newRole: string) => {
    startTransition(async () => {
      const { error } = await changeMemberRole(orgId, userId, newRole);
      if (error) toast.error(error);
      else {
        toast.success('Role updated.');
        router.refresh();
      }
    });
  };

  const handleRemoveMember = (userId: string) => {
    setRemoveMemberDialog({ open: true, userId });
  };

  const confirmRemoveMember = () => {
    if (!removeMemberDialog.userId) return;
    startTransition(async () => {
      const { error } = await removeMember(orgId, removeMemberDialog.userId!);
      if (error) toast.error(error);
      else {
        toast.success('Member removed.');
        router.refresh();
      }
    });
  };

  const handleSetExpiry = (userId: string, expiresAt: string | null) => {
    startTransition(async () => {
      const { error } = await setMemberExpiry(orgId, userId, expiresAt);
      if (error) toast.error(error);
      else {
        toast.success(expiresAt ? 'Expiry date set.' : 'Expiry cleared.');
        router.refresh();
      }
    });
  };

  const handleSendInvite = () => {
    startTransition(async () => {
      const { data, error } = await sendInvite({ orgId, email: inviteEmail, role: inviteRole });
      if (error) toast.error(error);
      else {
        toast.success(`Invite sent to ${inviteEmail}.`);
        if (data) setInvites((prev) => [data, ...prev]);
        setInviteDialogOpen(false);
        setInviteEmail('');
        setInviteRole('viewer');
      }
    });
  };

  const handleRevokeInvite = (inviteId: string) => {
    startTransition(async () => {
      const { error } = await revokeInvite(inviteId);
      if (error) toast.error(error);
      else {
        toast.success('Invite revoked.');
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      }
    });
  };

  const handleResendInvite = (inviteId: string) => {
    startTransition(async () => {
      const { error } = await resendInvite(inviteId);
      if (error) toast.error(error);
      else toast.success('Invite resent.');
    });
  };

  const handleDisableMember = (userId: string) => {
    startTransition(async () => {
      const { error } = await disableMember(orgId, userId);
      if (error) toast.error(error);
      else {
        toast.success('Member disabled.');
        router.refresh();
      }
    });
  };

  const handleEnableMember = (userId: string) => {
    startTransition(async () => {
      const { error } = await enableMember(orgId, userId);
      if (error) toast.error(error);
      else {
        toast.success('Member re-enabled.');
        router.refresh();
      }
    });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    startTransition(async () => {
      const { error } = await changePassword(newPassword);
      if (error) toast.error(error);
      else {
        toast.success('Password changed.');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      }
    });
  };

  const handleForceLogout = () => {
    setLogoutDialog(true);
  };

  const confirmForceLogout = () => {
    startTransition(async () => {
      const { error } = await forceLogoutAll();
      if (error) toast.error(error);
      else toast.success('All sessions terminated.');
    });
  };

  const handleArchiveBank = (bankId: string, bankName: string) => {
    setArchiveBankDialog({ open: true, bankId, bankName });
  };

  const confirmArchiveBank = () => {
    if (!archiveBankDialog.bankId) return;
    startTransition(async () => {
      const { data, error } = await archiveBankAccount(archiveBankDialog.bankId!);
      if (error) toast.error(error);
      else {
        toast.success('Bank account archived.');
        setBankAccountsList((prev) =>
          prev.map((b) =>
            b.id === archiveBankDialog.bankId ? { ...b, status: 'archived' as const } : b,
          ),
        );
        router.refresh();
      }
    });
  };

  const confirmResetWorkspace = () => {
    startTransition(async () => {
      const { error } = await resetMyWorkspace();
      if (error) toast.error(error);
      else {
        toast.success('Workspace reset. Your preferences have been restored to defaults.');
        setResetWorkspaceDialog(false);
      }
    });
  };

  const confirmErasureRequest = () => {
    startTransition(async () => {
      const { error } = await createDataErasureRequest(erasureScope, erasureReason || undefined);
      if (error) toast.error(error);
      else {
        toast.success('Data erasure request submitted. An admin will review it.');
        setErasureRequestDialog(false);
        setErasureScope('personal');
        setErasureReason('');
        setErasureConfirmInput('');
      }
    });
  };

  const activeBankAccounts = bankAccountsList.filter((b) => b.status === 'active');
  const displayedBankAccounts = showArchivedBanks
    ? bankAccountsList
    : bankAccountsList.filter((b) => b.status === 'active');

  /* ---- Render ---- */
  return (
    <>
      {isPending && (
        <p className="text-sm text-muted-foreground">Saving...</p>
      )}

      {/* ============================================================ */}
      {/*  12-column grid: flat children for correct mobile ordering    */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* ==== 1. Organisation Settings  (left col, order-1 mobile) ==== */}
        <Card className="order-1 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Organisation Settings</CardTitle>
              </div>
            </div>
            <CardDescription>Basic organisation details and preferences.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Org name */}
            <div className="space-y-1.5">
              <Label>Organisation Name</Label>
              <div className="flex gap-2">
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!canEdit}
                  className="flex-1"
                />
                {canEdit && (
                  <Button size="sm" onClick={saveOrgName} disabled={isPending}>
                    Save
                  </Button>
                )}
              </div>
            </div>

            {/* Logo placeholder */}
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                  Logo
                </div>
                <Badge variant="secondary" className="text-xs">Coming soon</Badge>
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>Default Currency</Label>
              <Input value="GBP (£)" disabled />
            </div>

            {/* Fiscal Year Start */}
            <div className="space-y-1.5">
              <Label>Financial Year Start Month</Label>
              <select
                className={SELECT_CLASS}
                value={s.fiscalYearStartMonth}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setS({ ...s, fiscalYearStartMonth: v });
                  saveOrgSettings({ fiscal_year_start_month: v });
                }}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <select
                className={SELECT_CLASS}
                value={s.timezone}
                disabled={!canEdit}
                onChange={(e) => {
                  setS({ ...s, timezone: e.target.value });
                  saveOrgSettings({ timezone: e.target.value });
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            {/* Date format */}
            <div className="space-y-1.5">
              <Label>Date Format</Label>
              <select
                className={SELECT_CLASS}
                value={s.dateFormat}
                disabled={!canEdit}
                onChange={(e) => {
                  setS({ ...s, dateFormat: e.target.value });
                  saveOrgSettings({ date_format: e.target.value });
                }}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* ==== 2. Team & Roles  (right col, order-2 mobile) ==== */}
        <Card className="order-2 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Team & Roles</CardTitle>
              </div>
              {isAdmin && (
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Mail size={14} className="mr-1.5" />
                      Invite User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invite User</DialogTitle>
                      <DialogDescription>
                        Send an invitation email. The user will be added to your organisation when they accept.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>Email Address</Label>
                        <Input
                          type="email"
                          placeholder="name@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Role</Label>
                        <select
                          className={SELECT_CLASS}
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as Role)}
                        >
                          {ALL_ROLES.filter((r) => r !== 'admin').map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Admin role must be assigned after the user joins.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setInviteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSendInvite}
                        disabled={isPending || !inviteEmail.trim()}
                      >
                        <Send size={14} className="mr-1.5" />
                        Send Invite
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <CardDescription>Manage team members and permissions.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Active Members Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-muted-foreground">
                        No members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((m) => (
                      <TableRow key={m.userId} className={m.status === 'disabled' ? 'opacity-50' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {m.fullName ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.email ?? (m.userId === currentUserId ? '(You)' : m.userId.slice(0, 8) + '...')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isAdmin && m.userId !== currentUserId ? (
                            <select
                              className={SELECT_CLASS + ' w-auto'}
                              value={m.role}
                              onChange={(e) =>
                                handleChangeRole(m.userId, e.target.value)
                              }
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {ROLE_LABELS[m.role] ?? m.role}
                            </Badge>
                          )}
                          {m.role === 'auditor' && (
                            <div className="mt-1 flex items-center gap-2">
                              {isAdmin ? (
                                <input
                                  type="date"
                                  className="h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  value={m.expiresAt ? m.expiresAt.slice(0, 10) : ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleSetExpiry(
                                      m.userId,
                                      val ? new Date(val + 'T23:59:59Z').toISOString() : null,
                                    );
                                  }}
                                />
                              ) : m.expiresAt ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Expires {new Date(m.expiresAt).toLocaleDateString('en-GB')}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No expiry
                                </span>
                              )}
                              {isAdmin && m.expiresAt && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => handleSetExpiry(m.userId, null)}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.status === 'active' ? 'default' :
                              m.status === 'disabled' ? 'destructive' :
                              'secondary'
                            }
                            className="text-[10px]"
                          >
                            {m.status}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {m.userId !== currentUserId && (
                              <div className="flex items-center justify-end gap-1">
                                {m.status === 'active' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Disable user"
                                    onClick={() => handleDisableMember(m.userId)}
                                    className="text-amber-600 hover:text-amber-700"
                                  >
                                    <UserMinus size={14} />
                                  </Button>
                                )}
                                {m.status === 'disabled' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Re-enable user"
                                    onClick={() => handleEnableMember(m.userId)}
                                    className="text-green-600 hover:text-green-700"
                                  >
                                    <UserCheck size={14} />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Remove member"
                                  onClick={() => handleRemoveMember(m.userId)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pending Invites */}
            {isAdmin && invites.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Pending Invites</p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{inv.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ROLE_LABELS[inv.role] ?? inv.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(inv.expiresAt).toLocaleDateString('en-GB')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Resend invite"
                                onClick={() => handleResendInvite(inv.id)}
                                disabled={isPending}
                              >
                                <RotateCcw size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Revoke invite"
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="text-destructive hover:text-destructive"
                                disabled={isPending}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ==== 3. Accounting Settings  (left col, order-3 mobile) ==== */}
        <Card className="order-3 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Accounting Settings</CardTitle>
              </div>
            </div>
            <CardDescription>Default accounts, thresholds, and accounting rules.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Default bank account */}
            <div className="space-y-1.5">
              <Label>Default Bank Account</Label>
              <select
                className={SELECT_CLASS}
                value={s.defaultBankAccountId ?? ''}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setS({ ...s, defaultBankAccountId: v });
                  saveOrgSettings({ default_bank_account_id: v });
                }}
              >
                <option value="">None</option>
                {activeBankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Default creditors account */}
            <div className="space-y-1.5">
              <Label>Default Creditors Account</Label>
              <select
                className={SELECT_CLASS}
                value={s.defaultCreditorsAccountId ?? ''}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setS({ ...s, defaultCreditorsAccountId: v });
                  saveOrgSettings({ default_creditors_account_id: v });
                }}
              >
                <option value="">None</option>
                {liabilityAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>

            {/* Overspend threshold £ */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Overspend Alert Threshold (pence)</Label>
                <Input
                  type="number"
                  value={s.overspendAmountPence}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setS({ ...s, overspendAmountPence: Number(e.target.value) })
                  }
                  onBlur={() =>
                    saveOrgSettings({
                      overspend_amount_pence: s.overspendAmountPence,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Overspend Alert Threshold (%)</Label>
                <Input
                  type="number"
                  value={s.overspendPercent}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setS({ ...s, overspendPercent: Number(e.target.value) })
                  }
                  onBlur={() =>
                    saveOrgSettings({ overspend_percent: s.overspendPercent })
                  }
                />
              </div>
            </div>

            {/* Forecast risk tolerance */}
            <div className="space-y-1.5">
              <Label>Forecast Risk Tolerance (pence)</Label>
              <Input
                type="number"
                value={s.forecastRiskTolerancePence}
                disabled={!canEdit}
                onChange={(e) =>
                  setS({
                    ...s,
                    forecastRiskTolerancePence: Number(e.target.value),
                  })
                }
                onBlur={() =>
                  saveOrgSettings({
                    forecast_risk_tolerance_pence: s.forecastRiskTolerancePence,
                  })
                }
              />
            </div>

            {/* Toggle: require fund on journal lines */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Require Fund on Journal Lines</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, every journal line must have a fund assigned.
                </p>
              </div>
              <Switch
                checked={s.requireFundOnJournalLines}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, requireFundOnJournalLines: v });
                  saveOrgSettings({ require_fund_on_journal_lines: v });
                }}
              />
            </div>

            {/* Toggle: lock posting after month close */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-medium">Lock Posting After Month Close</p>
                  <p className="text-xs text-muted-foreground">
                    Prevent posting journals to closed months.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
              </div>
              <Switch checked={false} disabled />
            </div>
          </CardContent>
        </Card>

        {/* ==== 3b. Payroll Accounts  (left col, order-3b mobile) ==== */}
        <Card className="order-3 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Payroll Accounts</CardTitle>
              </div>
            </div>
            <CardDescription>Map expense and liability accounts for payroll journal generation.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Expense accounts */}
              <div className="space-y-1.5">
                <Label>Salaries Expense</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollSalariesAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollSalariesAccountId: v });
                    saveOrgSettings({ payroll_salaries_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Employer NIC Expense</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollErNicAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollErNicAccountId: v });
                    saveOrgSettings({ payroll_er_nic_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Pension Expense</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollPensionAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollPensionAccountId: v });
                    saveOrgSettings({ payroll_pension_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              {/* Liability accounts */}
              <div className="space-y-1.5">
                <Label>PAYE/NIC Liability</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollPayeNicLiabilityId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollPayeNicLiabilityId: v });
                    saveOrgSettings({ payroll_paye_nic_liability_id: v });
                  }}
                >
                  <option value="">None</option>
                  {liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Pension Liability</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollPensionLiabilityId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollPensionLiabilityId: v });
                    saveOrgSettings({ payroll_pension_liability_id: v });
                  }}
                >
                  <option value="">None</option>
                  {liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Net Pay Liability</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.payrollNetPayLiabilityId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, payrollNetPayLiabilityId: v });
                    saveOrgSettings({ payroll_net_pay_liability_id: v });
                  }}
                >
                  <option value="">None</option>
                  {liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ==== 3c. Gift Aid Accounts  (left col, order-3c mobile) ==== */}
        <Card className="order-3 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Gift Aid Accounts</CardTitle>
              </div>
            </div>
            <CardDescription>Map accounts for Gift Aid GL posting when HMRC payments are recorded.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Gift Aid Income Account</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.giftAidIncomeAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, giftAidIncomeAccountId: v });
                    saveOrgSettings({ gift_aid_income_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Gift Aid Bank Account</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.giftAidBankAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, giftAidBankAccountId: v });
                    saveOrgSettings({ gift_aid_bank_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {/* Bank accounts are actually account rows with type=asset, referenced via bank_accounts table */}
                  {/* We use incomeAccounts here but for bank we need all accounts — use liabilityAccounts + expenseAccounts as fallback */}
                  {/* Actually, we should list all active accounts for bank selection */}
                  {[...liabilityAccounts, ...expenseAccounts, ...incomeAccounts].map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Select the GL account representing your bank for Gift Aid receipts.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Default Fund</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.giftAidDefaultFundId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, giftAidDefaultFundId: v });
                    saveOrgSettings({ gift_aid_default_fund_id: v });
                  }}
                >
                  <option value="">None (no fund)</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Used when proportional allocation is disabled or donations have no fund.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Proportional Fund Allocation</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, Gift Aid income is split proportionally across funds
                  based on the original donation fund allocation.
                </p>
              </div>
              <Switch
                checked={s.giftAidUseProportionalFunds}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, giftAidUseProportionalFunds: v });
                  saveOrgSettings({ gift_aid_use_proportional_funds: v });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ==== 3d. Donations Accounts  (left col, order-3d mobile) ==== */}
        <Card className="order-3 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Donations Accounts</CardTitle>
              </div>
            </div>
            <CardDescription>Map default accounts for donation GL posting.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Donations Income Account</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.defaultDonationsIncomeAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, defaultDonationsIncomeAccountId: v });
                    saveOrgSettings({ default_donations_income_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Income account credited when a donation is recorded.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Donations Bank Account</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.defaultDonationsBankAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, defaultDonationsBankAccountId: v });
                    saveOrgSettings({ default_donations_bank_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Bank account debited when a donation is received.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Donations Fee Account</Label>
                <select
                  className={SELECT_CLASS}
                  value={s.defaultDonationsFeeAccountId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setS({ ...s, defaultDonationsFeeAccountId: v });
                    saveOrgSettings({ default_donations_fee_account_id: v });
                  }}
                >
                  <option value="">None</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Expense account for platform fees (e.g. GoCardless, Stripe).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ==== Bank Accounts  (manage & archive) ==== */}
        <Card className="order-3e md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Bank Accounts</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-archived" className="text-xs font-normal text-muted-foreground">
                    Show archived
                  </Label>
                  <Switch
                    id="show-archived"
                    checked={showArchivedBanks}
                    onCheckedChange={setShowArchivedBanks}
                  />
                </div>
                <Link href="/banking">
                  <Button variant="outline" size="sm">
                    Add Bank Account
                  </Button>
                </Link>
              </div>
            </div>
            <CardDescription>Manage bank accounts. Archiving preserves transaction history for reporting.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Last 4</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedBankAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-8">
                        {showArchivedBanks ? 'No bank accounts.' : 'No active bank accounts.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedBankAccounts.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {b.account_number_last4 ? `****${b.account_number_last4}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === 'archived' ? 'secondary' : 'default'} className="text-[10px]">
                            {b.status}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {b.status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleArchiveBank(b.id, b.name)}
                              >
                                <Trash2 size={14} className="mr-1" />
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ==== Data Controls ==== */}
        <Card className="order-3f md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-muted-foreground" />
              <CardTitle className="text-base">Data Controls</CardTitle>
            </div>
            <CardDescription>Reset your workspace or request data erasure.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Reset my workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Restore your preferences (theme, landing page, date format) to defaults. Does not affect shared organisation data.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setResetWorkspaceDialog(true)}>
                <RotateCcw size={14} className="mr-1.5" />
                Reset
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Request data erasure</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Submit a request for personal or organisation-wide data deletion. An admin will review and process it.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setErasureRequestDialog(true)}>
                <AlertTriangle size={14} className="mr-1.5" />
                Request Erasure
              </Button>
            </div>
            {canEdit && (
              <div>
                <Link href="/settings/erasure-requests">
                  <Button variant="outline" size="sm">
                    View erasure requests
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ==== 4. Notifications  (right col, order-4 mobile) ==== */}
        <Card className="order-4 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Notifications</CardTitle>
              </div>
            </div>
            <CardDescription>Control email and alert preferences.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Receive email updates about your organisation.
                </p>
              </div>
              <Switch
                checked={s.emailNotifications}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, emailNotifications: v });
                  saveOrgSettings({ email_notifications: v });
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Overspend Alerts</p>
                <p className="text-xs text-muted-foreground">
                  Get notified when accounts exceed budget thresholds.
                </p>
              </div>
              <Switch
                checked={s.overspendAlertNotifications}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, overspendAlertNotifications: v });
                  saveOrgSettings({ overspend_alert_notifications: v });
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Month-End Reminder</p>
                <p className="text-xs text-muted-foreground">
                  Reminder to review and close the month.
                </p>
              </div>
              <Switch
                checked={s.monthEndReminder}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, monthEndReminder: v });
                  saveOrgSettings({ month_end_reminder: v });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ==== Workflow Settings ==== */}
        <Card className="order-[4.5] md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Workflow Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Receipt Compliance Days</label>
              <p className="text-xs text-muted-foreground mb-2">
                Number of days before a missing receipt is flagged as late.
              </p>
              <Input
                type="number"
                min={1}
                max={90}
                value={s.receiptComplianceDays}
                disabled={!canEdit}
                onChange={(e) => {
                  const val = Math.min(90, Math.max(1, parseInt(e.target.value) || 7));
                  setS({ ...s, receiptComplianceDays: val });
                }}
                onBlur={() => {
                  saveOrgSettings({ receipt_compliance_days: s.receiptComplianceDays });
                }}
                className="w-28"
              />
            </div>
          </CardContent>
        </Card>

        {/* ==== 5. Budget Settings  (left col, order-5 mobile) ==== */}
        <Card className="order-5 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Budget Settings</CardTitle>
              </div>
            </div>
            <CardDescription>Budget configuration and preferences.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Active budget year */}
            <div className="space-y-1.5">
              <Label>Active Budget Year</Label>
              <Input value={new Date().getFullYear().toString()} disabled />
            </div>

            {/* Budget mode */}
            <div className="space-y-1.5">
              <Label>Budget Mode</Label>
              <div className="flex items-center gap-2">
                <Input value="Monthly" disabled />
                <Badge variant="secondary" className="text-[10px] shrink-0">V1</Badge>
              </div>
            </div>

            {/* Allow fund-level budgets */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Allow Fund-Level Budgets</p>
                <p className="text-xs text-muted-foreground">
                  Enable budgeting at the individual fund level.
                </p>
              </div>
              <Switch
                checked={s.allowFundLevelBudgets}
                disabled={!canEdit}
                onCheckedChange={(v) => {
                  setS({ ...s, allowFundLevelBudgets: v });
                  saveOrgSettings({ allow_fund_level_budgets: v });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ==== 6. Security  (right col, order-6 mobile) ==== */}
        <Card className="order-6 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Security</CardTitle>
              </div>
            </div>
            <CardDescription>Password, sessions, and authentication.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Change password */}
            {!showPasswordForm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordForm(true)}
              >
                <Lock size={14} className="mr-2" />
                Change Password
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={isPending || !newPassword}
                  >
                    Update Password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Active sessions */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Active Sessions</p>
                <p className="text-xs text-muted-foreground">
                  Manage your login sessions.
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
            </div>

            {/* Force logout */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Force Logout All</p>
                <p className="text-xs text-muted-foreground">
                  Sign out from all devices.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleForceLogout}
                disabled={isPending}
              >
                Logout All
              </Button>
            </div>

            {/* 2FA */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-medium">Two-Factor Auth</p>
                  <p className="text-xs text-muted-foreground">
                    Extra security layer.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
              </div>
              <Switch checked={false} disabled />
            </div>
          </CardContent>
        </Card>

        {/* ==== 7. Data & Exports  (left col, order-7 mobile) ==== */}
        <Card className="order-7 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Data & Exports</CardTitle>
              </div>
            </div>
            <CardDescription>Export your data for backup or analysis.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Export All Data (CSV)</p>
                <p className="text-xs text-muted-foreground">
                  Download all organisation data as CSV files.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
                <Button variant="outline" size="sm" disabled>
                  Export
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Audit Log</p>
                <p className="text-xs text-muted-foreground">
                  View a record of all significant actions taken in your organisation.
                </p>
              </div>
              <Link href="/settings/audit-log">
                <Button variant="outline" size="sm">
                  View Log
                </Button>
              </Link>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <HardDrive size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Database Backups</p>
                  <p className="text-xs text-muted-foreground">
                    Managed by Supabase. View backup status and restore points.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://supabase.com/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    View Backups
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ==== Demo Data (admin only) ==== */}
        {role === 'admin' && (
          <Card className="order-8 md:col-span-4 rounded-2xl shadow-sm">
            <CardHeader className="p-6 pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical size={18} className="text-muted-foreground" />
                  <CardTitle className="text-base">Demo Data</CardTitle>
                </div>
              </div>
              <CardDescription>Generate or clear demo data for testing.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Create realistic sample records across all modules to test reports,
                reconciliation, and workflows. All demo records are tagged and can
                be removed without affecting real data.
              </p>
              <Link href="/settings/demo-data">
                <Button variant="outline" size="sm">
                  Manage Demo Data
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ==== 8. System Info  (right col, order-8 mobile) ==== */}
        <Card className="order-8 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">System Info</CardTitle>
              </div>
            </div>
            <CardDescription>Application and environment details.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <div className="grid grid-cols-1 gap-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">App Version</p>
                <p className="font-medium">1.0.0</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Environment</p>
                <p className="font-medium">
                  <Badge variant="outline" className="text-xs capitalize">
                    {getAppEnv()}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Last Data Refresh</p>
                <p className="font-medium">
                  {new Date().toLocaleString('en-GB')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Support</p>
                <a
                  href="mailto:support@churchledger.app"
                  className="font-medium text-blue-600 hover:underline"
                >
                  support@churchledger.app
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDestructiveDialog
        open={removeMemberDialog.open}
        onOpenChange={(open) => setRemoveMemberDialog({ ...removeMemberDialog, open })}
        title="Remove Member"
        description="Are you sure you want to remove this member from the organisation? This action cannot be undone."
        confirmPhrase={isProduction() ? 'REMOVE' : undefined}
        confirmLabel="Remove Member"
        onConfirm={confirmRemoveMember}
        isPending={isPending}
      />

      <ConfirmDestructiveDialog
        open={logoutDialog}
        onOpenChange={setLogoutDialog}
        title="Force Logout All"
        description="This will log out all sessions across all devices, including this one. You will need to sign in again."
        confirmPhrase={isProduction() ? 'LOGOUT' : undefined}
        confirmLabel="Logout All"
        onConfirm={confirmForceLogout}
        isPending={isPending}
      />

      <ConfirmDestructiveDialog
        open={archiveBankDialog.open}
        onOpenChange={(open) => setArchiveBankDialog(open ? archiveBankDialog : { open: false, bankId: null, bankName: '' })}
        title="Remove bank account"
        description={`This will archive "${archiveBankDialog.bankName}". Transactions will be preserved for reporting. You can view archived accounts by toggling "Show archived" above.`}
        confirmPhrase="REMOVE"
        confirmLabel="Remove"
        onConfirm={confirmArchiveBank}
        isPending={isPending}
      />

      <ConfirmDestructiveDialog
        open={resetWorkspaceDialog}
        onOpenChange={setResetWorkspaceDialog}
        title="Reset my workspace"
        description="This will restore your theme, default landing page, date format, and number format to defaults. Shared organisation data is not affected."
        confirmPhrase="RESET"
        confirmLabel="Reset"
        onConfirm={confirmResetWorkspace}
        isPending={isPending}
      />

      <Dialog open={erasureRequestDialog} onOpenChange={(open) => { setErasureRequestDialog(open); if (!open) setErasureConfirmInput(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request data erasure</DialogTitle>
            <DialogDescription>
              Submit a request for data deletion. An admin will review and process it. Personal scope: your profile and preferences. Church scope: all organisation data (admin/treasurer only).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <select
                className={SELECT_CLASS + ' w-full'}
                value={erasureScope}
                onChange={(e) => setErasureScope(e.target.value as 'personal' | 'church')}
                disabled={!canEdit}
              >
                <option value="personal">Personal (my data only)</option>
                {canEdit && <option value="church">Church (entire organisation)</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                value={erasureReason}
                onChange={(e) => setErasureReason(e.target.value)}
                placeholder="e.g. Leaving the organisation"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type ERASE to confirm</Label>
              <Input
                value={erasureConfirmInput}
                onChange={(e) => setErasureConfirmInput(e.target.value)}
                placeholder="ERASE"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErasureRequestDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmErasureRequest}
              disabled={erasureConfirmInput !== 'ERASE' || isPending}
            >
              {isPending ? 'Submitting...' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
