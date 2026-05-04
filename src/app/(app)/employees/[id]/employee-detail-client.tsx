'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Mail, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ALL_ROLES, ROLE_LABELS, type Role } from '@/lib/permissions';
import type { EmployeeMonitoringData } from '@/lib/employees/monitoring-types';
import {
  generatePortalInvite,
  resendInvite,
  revokeInvite,
  saveEmployeePortalPermissions,
  sendInvite,
} from '@/lib/invites/actions';
import type { Employee } from '@/lib/employees/types';
import {
  archiveEmployee,
  deleteEmployeeIfSafe,
  type EmployeeDeleteDependencyPreview,
} from '@/lib/employees/actions';
import type { EmployeePortalAccessData } from '@/lib/invites/types';
import {
  PORTAL_ACTION_KEYS,
  PORTAL_ACTION_LABELS,
  PORTAL_PAGE_KEYS,
  PORTAL_PAGE_LABELS,
  PORTAL_SCOPE_KEYS,
  PORTAL_SCOPE_LABELS,
  type PortalActionKey,
  type PortalPageKey,
  type PortalScopeKey,
} from '@/lib/portal-permission-constants';
import {
  EmployeeMonitoringActivity,
  EmployeeMonitoringBudgets,
  EmployeeMonitoringCalendar,
  EmployeeMonitoringCards,
  EmployeeMonitoringSubmissions,
  EmployeeMonitoringSummaryCards,
  EmployeeMonitoringTransactions,
} from './employee-monitoring-tabs';

const SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

function getToggleState(
  permission: EmployeePortalAccessData['permission'],
  group: 'pages' | 'actions' | 'scopes',
  key: string,
  fallback = false,
) {
  const groupValue = permission?.permissions?.[group];
  if (!groupValue || typeof groupValue !== 'object') return fallback;
  return Boolean((groupValue as Record<string, unknown>)[key]);
}

function readPresetGroup<T extends string>(
  permissions: Record<string, unknown>,
  group: 'pages' | 'actions' | 'scopes',
  keys: readonly T[],
  fallback: Record<T, boolean>,
) {
  const value = permissions[group];
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(keys.map((key) => [key, typeof record[key] === 'boolean' ? record[key] : fallback[key]])) as Record<T, boolean>;
}

export function EmployeeDetailClient({
  employee,
  orgId,
  canManagePortal,
  portalAccess,
  monitoringData,
  deletePreview,
}: {
  employee: Employee;
  orgId: string;
  canManagePortal: boolean;
  portalAccess: EmployeePortalAccessData | null;
  monitoringData: EmployeeMonitoringData | null;
  deletePreview: EmployeeDeleteDependencyPreview | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'overview' | 'portal' | 'budgets' | 'submissions' | 'transactions' | 'cards' | 'calendar' | 'activity'>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState(employee.full_name);
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(portalAccess?.permission?.permissionPresetId ?? '');
  const [pagePermissions, setPagePermissions] = useState<Record<PortalPageKey, boolean>>(
    Object.fromEntries(PORTAL_PAGE_KEYS.map((key) => [key, getToggleState(portalAccess?.permission ?? null, 'pages', key, key === 'dashboard' || key === 'calendar' || key === 'documents')])) as Record<PortalPageKey, boolean>,
  );
  const [actionPermissions, setActionPermissions] = useState<Record<PortalActionKey, boolean>>(
    Object.fromEntries(PORTAL_ACTION_KEYS.map((key) => [key, getToggleState(portalAccess?.permission ?? null, 'actions', key, key === 'view')])) as Record<PortalActionKey, boolean>,
  );
  const [scopePermissions, setScopePermissions] = useState<Record<PortalScopeKey, boolean>>(
    Object.fromEntries(PORTAL_SCOPE_KEYS.map((key) => [key, getToggleState(portalAccess?.permission ?? null, 'scopes', key, key === 'own_records')])) as Record<PortalScopeKey, boolean>,
  );
  const [budgetAssignments, setBudgetAssignments] = useState(portalAccess?.budgetAssignments ?? []);
  const [fundAssignments, setFundAssignments] = useState(portalAccess?.fundAssignments ?? []);
  const [categoryAssignments, setCategoryAssignments] = useState(portalAccess?.categoryAssignments ?? []);
  const [cardAssignments, setCardAssignments] = useState(portalAccess?.cardAssignments ?? []);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const pendingInvites = portalAccess?.invites.filter((invite) => invite.status === 'draft' || invite.status === 'sent') ?? [];
  const effectiveSummary = useMemo(() => {
    const enabledPages = PORTAL_PAGE_KEYS.filter((key) => pagePermissions[key]).map((key) => PORTAL_PAGE_LABELS[key]);
    const enabledActions = PORTAL_ACTION_KEYS.filter((key) => actionPermissions[key]).map((key) => PORTAL_ACTION_LABELS[key]);
    const enabledScopes = PORTAL_SCOPE_KEYS.filter((key) => scopePermissions[key]).map((key) => PORTAL_SCOPE_LABELS[key]);
    return { enabledPages, enabledActions, enabledScopes };
  }, [actionPermissions, pagePermissions, scopePermissions]);

  const applyPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);
    const preset = portalAccess?.presets.find((item) => item.id === nextPresetId);
    if (!preset) return;
    setPagePermissions(readPresetGroup(preset.permissions, 'pages', PORTAL_PAGE_KEYS, pagePermissions));
    setActionPermissions(readPresetGroup(preset.permissions, 'actions', PORTAL_ACTION_KEYS, actionPermissions));
    setScopePermissions(readPresetGroup(preset.permissions, 'scopes', PORTAL_SCOPE_KEYS, scopePermissions));
  };

  const handleGenerateInvite = (sendEmail: boolean) => {
    startTransition(async () => {
      const result = sendEmail
        ? await sendInvite({
            orgId,
            email: inviteEmail,
            role: inviteRole,
            invitedFullName: inviteName,
            employeeId: employee.id,
            permissionPresetId: presetId || null,
          })
        : await generatePortalInvite({
            employeeId: employee.id,
            invitedEmail: inviteEmail,
            invitedFullName: inviteName,
            role: inviteRole,
            permissionPresetId: presetId || null,
          });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.data?.inviteUrl) setInviteLink(result.data.inviteUrl);
      toast.success(sendEmail ? 'Invite email sent.' : 'Invite link generated.');
      router.refresh();
    });
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied.');
  };

  const handleResend = (inviteId: string) => {
    startTransition(async () => {
      const { data, error } = await resendInvite(inviteId);
      if (error) {
        toast.error(error);
        return;
      }
      if (data?.inviteUrl) setInviteLink(data.inviteUrl);
      toast.success('Invite resent.');
      router.refresh();
    });
  };

  const handleRevoke = (inviteId: string) => {
    startTransition(async () => {
      const { error } = await revokeInvite(inviteId);
      if (error) toast.error(error);
      else {
        toast.success('Invite revoked.');
        router.refresh();
      }
    });
  };

  const handleSavePermissions = () => {
    startTransition(async () => {
      const { error } = await saveEmployeePortalPermissions({
        employeeId: employee.id,
        permissionPresetId: presetId || null,
        permissions: {
          pages: pagePermissions,
          actions: actionPermissions,
          scopes: scopePermissions,
        },
        budgetAssignments,
        fundAssignments,
        categoryAssignments,
        cardAssignments,
      });
      if (error) toast.error(error);
      else toast.success('Portal permissions saved.');
    });
  };

  const handleArchiveEmployee = () => {
    startTransition(async () => {
      const result = await archiveEmployee(employee.id, archiveReason);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Staff member archived.');
        router.refresh();
      }
    });
  };

  const handleDeleteEmployee = () => {
    startTransition(async () => {
      const result = await deleteEmployeeIfSafe(employee.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Staff member deleted.');
        router.push('/employees');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} />
        Back to Employees
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{employee.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {employee.role ?? 'No role recorded'} · {employee.is_active ? 'Active' : 'Archived'}
          </p>
        </div>
        <Badge variant={employee.is_active ? 'default' : 'secondary'}>
          {employee.is_active ? 'Active' : 'Archived'}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        <Button variant={activeTab === 'overview' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('overview')}>
          Overview
        </Button>
        <Button variant={activeTab === 'portal' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('portal')}>
          Portal Access
        </Button>
        {canManagePortal ? (
          <>
            <Button variant={activeTab === 'budgets' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('budgets')}>Budgets</Button>
            <Button variant={activeTab === 'submissions' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('submissions')}>Submissions</Button>
            <Button variant={activeTab === 'transactions' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('transactions')}>Transactions</Button>
            <Button variant={activeTab === 'cards' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('cards')}>Cards</Button>
            <Button variant={activeTab === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('calendar')}>Calendar</Button>
            <Button variant={activeTab === 'activity' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('activity')}>Activity / Audit</Button>
          </>
        ) : null}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-4">
          <EmployeeMonitoringSummaryCards data={monitoringData} />
          <Card className="rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader>
              <CardTitle>Employee Details</CardTitle>
              <CardDescription>Payroll-facing employee record with admin portal monitoring summary.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">NI Number</p>
                <p className="mt-1 text-sm">{employee.ni_number ?? 'Not recorded'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Tax Code</p>
                <p className="mt-1 text-sm">{employee.tax_code ?? 'Not recorded'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Created</p>
                <p className="mt-1 text-sm">{new Date(employee.created_at).toLocaleDateString('en-GB')}</p>
              </div>
            </CardContent>
          </Card>
          {canManagePortal ? (
            <Card className="rounded-3xl border-destructive/30 bg-card shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trash2 size={18} className="text-destructive" />
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                </div>
                <CardDescription>
                  Archive staff with history, or delete only when no linked records exist.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm font-medium">Dependency preview</p>
                  {deletePreview ? (
                    deletePreview.total > 0 ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          This staff member has {deletePreview.total} linked record(s). They cannot be deleted, but can be archived.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(deletePreview.counts).map(([key, count]) => (
                            <Badge key={key} variant="secondary">
                              {key.replaceAll('_', ' ')}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No linked records found. Hard delete is available if you type DELETE STAFF.
                      </p>
                    )
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Dependency preview unavailable.</p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border/70 p-4">
                    <div>
                      <p className="text-sm font-medium">Archive staff member</p>
                      <p className="text-sm text-muted-foreground">
                        Hide from active lists and prevent new use while preserving history.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="archive-reason">Archive reason</Label>
                      <Input
                        id="archive-reason"
                        value={archiveReason}
                        onChange={(event) => setArchiveReason(event.target.value)}
                        placeholder="Optional reason"
                      />
                    </div>
                    <Button
                      variant="outline"
                      disabled={isPending || !employee.is_active}
                      onClick={handleArchiveEmployee}
                    >
                      Archive staff member
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                    <div>
                      <p className="text-sm font-medium">Delete staff member</p>
                      <p className="text-sm text-muted-foreground">
                        Only possible when there are no payroll, portal, invite, or submission dependencies.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="delete-staff-confirmation">Type DELETE STAFF</Label>
                      <Input
                        id="delete-staff-confirmation"
                        value={deleteConfirmation}
                        onChange={(event) => setDeleteConfirmation(event.target.value)}
                        placeholder="DELETE STAFF"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      disabled={isPending || deleteConfirmation !== 'DELETE STAFF' || !deletePreview?.canDelete}
                      onClick={handleDeleteEmployee}
                    >
                      <Trash2 size={14} className="mr-2" />
                      Delete staff member
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'portal' ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck size={18} />
                Portal Access
              </CardTitle>
              <CardDescription>
                Invite this person into the workspace and control page, action, budget, fund, and bank-card access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!canManagePortal ? (
                <p className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Only admins can manage portal invitations and permissions.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" />
                    </label>
                    <label className="space-y-1.5">
                      <Label>Full name</Label>
                      <Input value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
                    </label>
                    <label className="space-y-1.5">
                      <Label>Role</Label>
                      <select className={SELECT_CLASS} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
                        {ALL_ROLES.filter((role) => role !== 'admin').map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <Label>Permission preset</Label>
                      <select className={SELECT_CLASS} value={presetId} onChange={(event) => applyPreset(event.target.value)}>
                        <option value="">No preset</option>
                        {(portalAccess?.presets ?? []).map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => handleGenerateInvite(false)} disabled={isPending || !inviteEmail.trim()}>
                      Generate invite
                    </Button>
                    <Button variant="outline" onClick={() => handleGenerateInvite(true)} disabled={isPending || !inviteEmail.trim()}>
                      <Mail size={14} className="mr-1.5" />
                      Send invite email
                    </Button>
                    <Button variant="outline" onClick={handleCopyInvite} disabled={!inviteLink}>
                      <Copy size={14} className="mr-1.5" />
                      Copy invite link
                    </Button>
                  </div>

                  {inviteLink ? (
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                      {inviteLink}
                    </div>
                  ) : null}
                </>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold">Invite status</p>
                {pendingInvites.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Expires</TableHead>
                          {canManagePortal ? <TableHead className="text-right">Actions</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingInvites.map((invite) => (
                          <TableRow key={invite.id}>
                            <TableCell>{invite.invitedEmail}</TableCell>
                            <TableCell><Badge variant="outline">{invite.status}</Badge></TableCell>
                            <TableCell className="font-mono text-xs">{invite.inviteCode}</TableCell>
                            <TableCell>{new Date(invite.expiresAt).toLocaleDateString('en-GB')}</TableCell>
                            {canManagePortal ? (
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => handleResend(invite.id)} disabled={isPending} title="Resend invite">
                                  <RotateCcw size={14} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleRevoke(invite.id)} disabled={isPending} title="Revoke invite" className="text-destructive hover:text-destructive">
                                  <Trash2 size={14} />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                    No active portal invite for this record.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader>
              <CardTitle>Permissions & Scope</CardTitle>
              <CardDescription>Fine-tune what this portal user can see and do.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-semibold">Page access</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PORTAL_PAGE_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <input type="checkbox" checked={pagePermissions[key]} disabled={!canManagePortal} onChange={() => setPagePermissions((current) => ({ ...current, [key]: !current[key] }))} />
                      {PORTAL_PAGE_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Actions</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PORTAL_ACTION_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <input type="checkbox" checked={actionPermissions[key]} disabled={!canManagePortal} onChange={() => setActionPermissions((current) => ({ ...current, [key]: !current[key] }))} />
                      {PORTAL_ACTION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Scopes</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PORTAL_SCOPE_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                      <input type="checkbox" checked={scopePermissions[key]} disabled={!canManagePortal} onChange={() => setScopePermissions((current) => ({ ...current, [key]: !current[key] }))} />
                      {PORTAL_SCOPE_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>

              <AssignmentTable
                title="Budget assignment table"
                items={portalAccess?.budgets ?? []}
                values={budgetAssignments}
                disabled={!canManagePortal || !portalAccess?.permission?.userId}
                onToggle={(id) => setBudgetAssignments((values) => values.some((assignment) => assignment.budgetId === id)
                  ? values.filter((assignment) => assignment.budgetId !== id)
                  : [...values, { id, userId: portalAccess?.permission?.userId ?? '', budgetId: id, budgetCategoryId: null, canView: true, canSubmitAgainst: true, spendingLimit: null }])}
                getId={(assignment) => assignment.budgetId}
                getCanView={(assignment) => assignment.canView}
                getCanSubmit={(assignment) => assignment.canSubmitAgainst}
                onViewChange={(id) => setBudgetAssignments((values) => values.map((assignment) => assignment.budgetId === id ? { ...assignment, canView: !assignment.canView } : assignment))}
                onSubmitChange={(id) => setBudgetAssignments((values) => values.map((assignment) => assignment.budgetId === id ? { ...assignment, canSubmitAgainst: !assignment.canSubmitAgainst } : assignment))}
              />
              <AssignmentTable
                title="Fund assignment table"
                items={portalAccess?.funds ?? []}
                values={fundAssignments}
                disabled={!canManagePortal || !portalAccess?.permission?.userId}
                onToggle={(id) => setFundAssignments((values) => values.some((assignment) => assignment.fundId === id)
                  ? values.filter((assignment) => assignment.fundId !== id)
                  : [...values, { id, userId: portalAccess?.permission?.userId ?? '', fundId: id, canView: true, canSubmitAgainst: true }])}
                getId={(assignment) => assignment.fundId}
                getCanView={(assignment) => assignment.canView}
                getCanSubmit={(assignment) => assignment.canSubmitAgainst}
                onViewChange={(id) => setFundAssignments((values) => values.map((assignment) => assignment.fundId === id ? { ...assignment, canView: !assignment.canView } : assignment))}
                onSubmitChange={(id) => setFundAssignments((values) => values.map((assignment) => assignment.fundId === id ? { ...assignment, canSubmitAgainst: !assignment.canSubmitAgainst } : assignment))}
              />
              <AssignmentTable
                title="Category assignment table"
                items={portalAccess?.categories ?? []}
                values={categoryAssignments}
                disabled={!canManagePortal || !portalAccess?.permission?.userId}
                onToggle={(id) => setCategoryAssignments((values) => values.some((assignment) => assignment.categoryId === id)
                  ? values.filter((assignment) => assignment.categoryId !== id)
                  : [...values, { id, userId: portalAccess?.permission?.userId ?? '', categoryId: id, canView: true, canSubmitAgainst: true }])}
                getId={(assignment) => assignment.categoryId}
                getCanView={(assignment) => assignment.canView}
                getCanSubmit={(assignment) => assignment.canSubmitAgainst}
                onViewChange={(id) => setCategoryAssignments((values) => values.map((assignment) => assignment.categoryId === id ? { ...assignment, canView: !assignment.canView } : assignment))}
                onSubmitChange={(id) => setCategoryAssignments((values) => values.map((assignment) => assignment.categoryId === id ? { ...assignment, canSubmitAgainst: !assignment.canSubmitAgainst } : assignment))}
              />
              <CardAssignmentTable
                items={portalAccess?.bankAccounts ?? []}
                values={cardAssignments}
                disabled={!canManagePortal || !portalAccess?.permission?.userId}
                onChange={setCardAssignments}
                userId={portalAccess?.permission?.userId ?? ''}
              />

              <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm">
                <p className="font-semibold">Effective permissions</p>
                <p className="mt-2 text-xs text-muted-foreground">Pages: {effectiveSummary.enabledPages.join(', ') || 'None'}</p>
                <p className="text-xs text-muted-foreground">Actions: {effectiveSummary.enabledActions.join(', ') || 'None'}</p>
                <p className="text-xs text-muted-foreground">Scopes: {effectiveSummary.enabledScopes.join(', ') || 'None'}</p>
              </div>

              {canManagePortal ? (
                <Button className="w-full" onClick={handleSavePermissions} disabled={isPending}>
                  Save portal permissions
                </Button>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-semibold">Recent activity</p>
                <div className="space-y-2">
                  {(portalAccess?.recentActivity ?? []).length > 0 ? (
                    portalAccess!.recentActivity.map((activity) => (
                      <div key={activity.id} className="rounded-xl border border-border/70 px-3 py-2 text-sm">
                        <p className="font-medium">{activity.action.replaceAll('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString('en-GB')}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No portal activity yet.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canManagePortal && activeTab === 'budgets' ? (
        <EmployeeMonitoringBudgets rows={monitoringData?.budgetUsage ?? []} />
      ) : null}
      {canManagePortal && activeTab === 'submissions' ? (
        <EmployeeMonitoringSubmissions rows={monitoringData?.submissions ?? []} />
      ) : null}
      {canManagePortal && activeTab === 'transactions' ? (
        <EmployeeMonitoringTransactions rows={monitoringData?.transactions ?? []} />
      ) : null}
      {canManagePortal && activeTab === 'cards' ? (
        <EmployeeMonitoringCards rows={monitoringData?.cards ?? []} />
      ) : null}
      {canManagePortal && activeTab === 'calendar' ? (
        <EmployeeMonitoringCalendar rows={monitoringData?.calendar ?? []} />
      ) : null}
      {canManagePortal && activeTab === 'activity' ? (
        <EmployeeMonitoringActivity rows={monitoringData?.activity ?? []} />
      ) : null}
    </div>
  );
}

function AssignmentTable<T>({
  title,
  items,
  values,
  disabled,
  onToggle,
  getId,
  getCanView,
  getCanSubmit,
  onViewChange,
  onSubmitChange,
}: {
  title: string;
  items: { id: string; name: string; label?: string }[];
  values: T[];
  disabled: boolean;
  onToggle: (id: string) => void;
  getId: (value: T) => string;
  getCanView: (value: T) => boolean;
  getCanSubmit: (value: T) => boolean;
  onViewChange: (id: string) => void;
  onSubmitChange: (id: string) => void;
}) {
  const valueById = new Map(values.map((value) => [getId(value), value]));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Can view</TableHead>
              <TableHead>Can submit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length > 0 ? items.map((item) => {
              const assignment = valueById.get(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.name}
                    {item.label ? <span className="ml-2 text-xs text-muted-foreground">{item.label}</span> : null}
                  </TableCell>
                  <TableCell>
                    <input type="checkbox" checked={Boolean(assignment)} disabled={disabled} onChange={() => onToggle(item.id)} />
                  </TableCell>
                  <TableCell>
                    <input type="checkbox" checked={assignment ? getCanView(assignment) : false} disabled={disabled || !assignment} onChange={() => onViewChange(item.id)} />
                  </TableCell>
                  <TableCell>
                    <input type="checkbox" checked={assignment ? getCanSubmit(assignment) : false} disabled={disabled || !assignment} onChange={() => onSubmitChange(item.id)} />
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">No records available.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CardAssignmentTable({
  items,
  values,
  disabled,
  onChange,
  userId,
}: {
  items: { id: string; name: string; label?: string }[];
  values: EmployeePortalAccessData['cardAssignments'];
  disabled: boolean;
  onChange: (values: EmployeePortalAccessData['cardAssignments']) => void;
  userId: string;
}) {
  const valueByAccount = new Map(values.flatMap((value) => value.bankAccountId ? [[value.bankAccountId, value] as const] : []));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Card assignment table</p>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account/card</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Card name</TableHead>
              <TableHead>Last four</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length > 0 ? items.map((item) => {
              const assignment = valueByAccount.get(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.name}
                    {item.label ? <span className="ml-2 text-xs text-muted-foreground">{item.label}</span> : null}
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={Boolean(assignment)}
                      disabled={disabled}
                      onChange={() => onChange(assignment
                        ? values.filter((value) => value.bankAccountId !== item.id)
                        : [...values, { id: item.id, userId, bankAccountId: item.id, cardName: item.name, lastFour: null, spendingLimit: null, status: 'active' }])}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={assignment?.cardName ?? ''}
                      disabled={disabled || !assignment}
                      onChange={(event) => onChange(values.map((value) => value.bankAccountId === item.id ? { ...value, cardName: event.target.value } : value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={assignment?.lastFour ?? ''}
                      disabled={disabled || !assignment}
                      maxLength={4}
                      onChange={(event) => onChange(values.map((value) => value.bankAccountId === item.id ? { ...value, lastFour: event.target.value } : value))}
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      className={SELECT_CLASS}
                      value={assignment?.status ?? 'active'}
                      disabled={disabled || !assignment}
                      onChange={(event) => onChange(values.map((value) => value.bankAccountId === item.id ? { ...value, status: event.target.value as 'active' | 'inactive' | 'archived' } : value))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="archived">Archived</option>
                    </select>
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">No bank accounts available.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
