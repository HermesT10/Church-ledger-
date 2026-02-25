'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { OrgSettings, MemberRow } from './types';

/* ------------------------------------------------------------------ */
/*  getSettings                                                        */
/* ------------------------------------------------------------------ */

export async function getSettings(orgId: string): Promise<{
  data: OrgSettings | null;
  error: string | null;
}> {
  const supabase = await createClient();

  // Fetch org name
  const { data: org, error: orgErr } = await supabase
    .from('organisations')
    .select('name')
    .eq('id', orgId)
    .single();

  if (orgErr) return { data: null, error: orgErr.message };

  // Upsert org settings (ensure row exists)
  const { error: upsertErr } = await supabase
    .from('organisation_settings')
    .upsert(
      { organisation_id: orgId },
      { onConflict: 'organisation_id' },
    );

  if (upsertErr) return { data: null, error: upsertErr.message };

  // Fetch settings
  const { data: settings, error: settingsErr } = await supabase
    .from('organisation_settings')
    .select('*')
    .eq('organisation_id', orgId)
    .single();

  if (settingsErr) return { data: null, error: settingsErr.message };

  return {
    data: {
      organisationName: org.name,
      overspendAmountPence: settings.overspend_amount_pence,
      overspendPercent: settings.overspend_percent,
      fiscalYearStartMonth: settings.fiscal_year_start_month ?? 1,
      timezone: settings.timezone ?? 'Europe/London',
      dateFormat: settings.date_format ?? 'DD/MM/YYYY',
      defaultBankAccountId: settings.default_bank_account_id ?? null,
      defaultCreditorsAccountId: settings.default_creditors_account_id ?? null,
      forecastRiskTolerancePence: settings.forecast_risk_tolerance_pence ?? 5000,
      requireFundOnJournalLines: settings.require_fund_on_journal_lines ?? false,
      allowFundLevelBudgets: settings.allow_fund_level_budgets ?? true,
      emailNotifications: settings.email_notifications ?? true,
      overspendAlertNotifications: settings.overspend_alert_notifications ?? true,
      monthEndReminder: settings.month_end_reminder ?? true,
      // Payroll account mappings
      payrollSalariesAccountId: settings.payroll_salaries_account_id ?? null,
      payrollErNicAccountId: settings.payroll_er_nic_account_id ?? null,
      payrollPensionAccountId: settings.payroll_pension_account_id ?? null,
      payrollPayeNicLiabilityId: settings.payroll_paye_nic_liability_id ?? null,
      payrollPensionLiabilityId: settings.payroll_pension_liability_id ?? null,
      payrollNetPayLiabilityId: settings.payroll_net_pay_liability_id ?? null,
      // Gift Aid account mappings
      giftAidIncomeAccountId: settings.gift_aid_income_account_id ?? null,
      giftAidBankAccountId: settings.gift_aid_bank_account_id ?? null,
      giftAidDefaultFundId: settings.gift_aid_default_fund_id ?? null,
      giftAidUseProportionalFunds: settings.gift_aid_use_proportional_funds ?? true,
      // Cash Management
      cashInHandAccountId: settings.cash_in_hand_account_id ?? null,
      // Donations
      defaultDonationsIncomeAccountId: settings.default_donations_income_account_id ?? null,
      defaultDonationsBankAccountId: settings.default_donations_bank_account_id ?? null,
      defaultDonationsFeeAccountId: settings.default_donations_fee_account_id ?? null,
      // Workflow settings
      receiptComplianceDays: settings.receipt_compliance_days ?? 7,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  updateOrgName                                                      */
/* ------------------------------------------------------------------ */

export async function updateOrgName(
  orgId: string,
  name: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'settings'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied' }; }

  if (!name.trim()) return { error: 'Organisation name is required' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisations')
    .update({ name: name.trim() })
    .eq('id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  updateOrgSettings                                                  */
/* ------------------------------------------------------------------ */

export async function updateOrgSettings(
  orgId: string,
  fields: Partial<{
    overspend_amount_pence: number;
    overspend_percent: number;
    fiscal_year_start_month: number;
    timezone: string;
    date_format: string;
    default_bank_account_id: string | null;
    default_creditors_account_id: string | null;
    forecast_risk_tolerance_pence: number;
    require_fund_on_journal_lines: boolean;
    allow_fund_level_budgets: boolean;
    email_notifications: boolean;
    overspend_alert_notifications: boolean;
    month_end_reminder: boolean;
    payroll_salaries_account_id: string | null;
    payroll_er_nic_account_id: string | null;
    payroll_pension_account_id: string | null;
    payroll_paye_nic_liability_id: string | null;
    payroll_pension_liability_id: string | null;
    payroll_net_pay_liability_id: string | null;
    gift_aid_income_account_id: string | null;
    gift_aid_bank_account_id: string | null;
    gift_aid_default_fund_id: string | null;
    gift_aid_use_proportional_funds: boolean;
    cash_in_hand_account_id: string | null;
    default_donations_income_account_id: string | null;
    default_donations_bank_account_id: string | null;
    default_donations_fee_account_id: string | null;
    receipt_compliance_days: number;
  }>,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'settings'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisation_settings')
    .update(fields)
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  listMembers                                                        */
/* ------------------------------------------------------------------ */

export async function listMembers(
  orgId: string,
): Promise<{ data: MemberRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, role, status, created_at, joined_at, expires_at, profiles(full_name, email)')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };

  const rows: MemberRow[] = (data ?? []).map((m: Record<string, unknown>) => {
    const profile = m.profiles as { full_name: string | null; email: string | null } | null;
    return {
      userId: m.user_id as string,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      role: m.role as string,
      status: (m.status as MemberRow['status']) ?? 'active',
      createdAt: m.created_at as string,
      joinedAt: (m.joined_at as string) ?? null,
      expiresAt: (m.expires_at as string) ?? null,
    };
  });

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  changeMemberRole                                                   */
/* ------------------------------------------------------------------ */

export async function changeMemberRole(
  orgId: string,
  userId: string,
  newRole: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'members'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Only admins can change roles' }; }

  // Prevent changing own role
  if (user.id === userId) {
    return { error: 'Cannot change your own role' };
  }

  const { ALL_ROLES } = await import('@/lib/permissions');
  if (!ALL_ROLES.includes(newRole as typeof ALL_ROLES[number])) {
    return { error: `Invalid role: ${newRole}` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .update({ role: newRole })
    .eq('organisation_id', orgId)
    .eq('user_id', userId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  removeMember                                                       */
/* ------------------------------------------------------------------ */

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'delete', 'members'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Only admins can remove members' }; }

  if (user.id === userId) {
    return { error: 'Cannot remove yourself' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('organisation_id', orgId)
    .eq('user_id', userId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'remove_member',
      entityType: 'membership',
      entityId: userId,
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  disableMember                                                      */
/* ------------------------------------------------------------------ */

export async function disableMember(
  orgId: string,
  userId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'members'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Only admins can disable members' }; }

  if (user.id === userId) {
    return { error: 'Cannot disable yourself' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'disabled' })
    .eq('organisation_id', orgId)
    .eq('user_id', userId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'disable_member',
      entityType: 'membership',
      entityId: userId,
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  enableMember                                                       */
/* ------------------------------------------------------------------ */

export async function enableMember(
  orgId: string,
  userId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'members'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Only admins can enable members' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'active' })
    .eq('organisation_id', orgId)
    .eq('user_id', userId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'enable_member',
      entityType: 'membership',
      entityId: userId,
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  changePassword                                                     */
/* ------------------------------------------------------------------ */

export async function changePassword(
  newPassword: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  if (!newPassword || newPassword.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  forceLogoutAll                                                     */
/* ------------------------------------------------------------------ */

export async function forceLogoutAll(): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'force_logout_all',
    entityType: 'session',
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  archiveBankAccount                                                 */
/* ------------------------------------------------------------------ */

export async function archiveBankAccount(
  bankAccountId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'banking');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  const { data: account, error: fetchErr } = await supabase
    .from('bank_accounts')
    .select('id, organisation_id, name, is_active')
    .eq('id', bankAccountId)
    .single();

  if (fetchErr || !account) {
    return { error: fetchErr?.message ?? 'Bank account not found' };
  }

  if (account.organisation_id !== orgId) {
    return { error: 'Bank account does not belong to your organisation' };
  }

  if (!account.is_active) {
    return { error: 'Bank account is already archived' };
  }

  const { error: updateErr } = await supabase
    .from('bank_accounts')
    .update({ is_active: false })
    .eq('id', bankAccountId);

  if (updateErr) return { error: updateErr.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_account_archived',
    entityType: 'bank_account',
    entityId: bankAccountId,
    metadata: { name: account.name },
  });

  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  resetMyWorkspace                                                   */
/* ------------------------------------------------------------------ */

export async function resetMyWorkspace(): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();

  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      theme: 'system',
      default_landing_page: 'dashboard',
      default_report_view: 'YTD',
      number_format: 'comma',
      date_format_preference: 'DD/MM/YYYY',
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'user_workspace_reset',
    entityType: 'profile',
    entityId: user.id,
  });

  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  createDataErasureRequest                                           */
/* ------------------------------------------------------------------ */

export async function createDataErasureRequest(
  scope: 'personal' | 'church',
  reason?: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  if (scope === 'church') {
    try {
      assertCanPerform(role, 'update', 'settings');
    } catch (e) {
      return { error: e instanceof PermissionError ? e.message : 'Only admins and treasurers can request church-wide data erasure' };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.from('data_erasure_requests').insert({
    organisation_id: orgId,
    requester_user_id: user.id,
    scope,
    status: 'pending',
    reason: reason?.trim() || null,
  });

  if (error) return { error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'data_erasure_requested',
    entityType: 'data_erasure_request',
    metadata: { scope, reason: reason?.trim() || null },
  });

  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  listBankAccounts (with optional archived)                          */
/* ------------------------------------------------------------------ */

export async function listBankAccounts(
  orgId: string,
  includeArchived = false,
): Promise<{
  data: { id: string; name: string; account_number_last4: string | null; status: string }[];
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('bank_accounts')
    .select('id, name, account_number_last4, is_active')
    .eq('organisation_id', orgId)
    .order('name');

  if (!includeArchived) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      account_number_last4: r.account_number_last4 ?? null,
      status: r.is_active ? 'active' : 'archived',
    })),
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  setMemberExpiry                                                    */
/* ------------------------------------------------------------------ */

export async function setMemberExpiry(
  orgId: string,
  userId: string,
  expiresAt: string | null, // ISO date string or null to clear
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'members'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Only admins can set member expiry' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('memberships')
    .update({ expires_at: expiresAt })
    .eq('organisation_id', orgId)
    .eq('user_id', userId);

  return { error: error?.message ?? null };
}
