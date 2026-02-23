'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { Employee } from './types';

/* ------------------------------------------------------------------ */
/*  List employees                                                     */
/* ------------------------------------------------------------------ */

export async function listEmployees(
  orgId: string,
  includeInactive = false,
): Promise<{ data: Employee[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from('employees')
    .select('*')
    .eq('organisation_id', orgId);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('full_name');

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/* ------------------------------------------------------------------ */
/*  Get single employee                                                */
/* ------------------------------------------------------------------ */

export async function getEmployee(
  employeeId: string,
): Promise<{ data: Employee | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/* ------------------------------------------------------------------ */
/*  Create employee                                                    */
/* ------------------------------------------------------------------ */

export async function createEmployee(params: {
  fullName: string;
  niNumber?: string;
  taxCode?: string;
  role?: string;
}): Promise<{ data: Employee | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role: userRole, user } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'create', 'payroll');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  if (!params.fullName.trim()) {
    return { data: null, error: 'Employee name is required.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('employees')
    .insert({
      organisation_id: orgId,
      full_name: params.fullName.trim(),
      ni_number: params.niNumber?.trim() || null,
      tax_code: params.taxCode?.trim() || null,
      role: params.role?.trim() || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_employee',
    entityType: 'employee',
    entityId: data.id,
  });

  return { data, error: null };
}

/* ------------------------------------------------------------------ */
/*  Update employee                                                    */
/* ------------------------------------------------------------------ */

export async function updateEmployee(
  employeeId: string,
  params: {
    fullName?: string;
    niNumber?: string;
    taxCode?: string;
    role?: string;
  },
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role: userRole, user } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'update', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (params.fullName !== undefined) updates.full_name = params.fullName.trim();
  if (params.niNumber !== undefined) updates.ni_number = params.niNumber.trim() || null;
  if (params.taxCode !== undefined) updates.tax_code = params.taxCode.trim() || null;
  if (params.role !== undefined) updates.role = params.role.trim() || null;

  const { error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'update_employee',
    entityType: 'employee',
    entityId: employeeId,
  });

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Archive / Unarchive employee                                       */
/* ------------------------------------------------------------------ */

export async function archiveEmployee(
  employeeId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role: userRole, user } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'update', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'archive_employee',
    entityType: 'employee',
    entityId: employeeId,
  });

  return { success: true, error: null };
}

export async function unarchiveEmployee(
  employeeId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role: userRole } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'update', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('employees')
    .update({ is_active: true })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}
