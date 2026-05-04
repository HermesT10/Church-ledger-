'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  reason?: string,
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
    .update({
      is_active: false,
      status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: user.id,
      archive_reason: reason?.trim() || null,
    })
    .eq('id', employeeId)
    .eq('organisation_id', orgId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'archive_employee',
    entityType: 'employee',
    entityId: employeeId,
    metadata: { reason: reason?.trim() || null },
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
    .update({
      is_active: true,
      status: 'active',
      archived_at: null,
      archived_by: null,
      archive_reason: null,
    })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

export interface EmployeeDeleteDependencyPreview {
  exists: boolean;
  total: number;
  counts: Record<string, number>;
  canDelete: boolean;
}

function normalizeDependencyPreview(payload: unknown): EmployeeDeleteDependencyPreview {
  const raw = (payload ?? {}) as Partial<EmployeeDeleteDependencyPreview>;
  const counts = raw.counts && typeof raw.counts === 'object' && !Array.isArray(raw.counts)
    ? Object.fromEntries(
        Object.entries(raw.counts as Record<string, unknown>).map(([key, value]) => [
          key,
          Number(value ?? 0),
        ]),
      )
    : {};
  return {
    exists: Boolean(raw.exists),
    total: Number(raw.total ?? 0),
    counts,
    canDelete: Boolean(raw.canDelete),
  };
}

export async function getEmployeeDeleteDependencyPreview(
  employeeId: string,
): Promise<{ data: EmployeeDeleteDependencyPreview | null; error: string | null }> {
  const { orgId, role: userRole } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'delete', 'payroll');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (!employee) {
    return { data: null, error: 'Employee not found.' };
  }

  const { data, error } = await admin.rpc('get_employee_delete_dependency_preview', {
    target_employee_id: employeeId,
  });

  if (error) return { data: null, error: error.message };
  return { data: normalizeDependencyPreview(data), error: null };
}

export async function deleteEmployeeIfSafe(
  employeeId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role: userRole, user } = await getActiveOrg();

  try {
    assertCanPerform(userRole, 'delete', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (!employee) {
    return { success: false, error: 'Employee not found.' };
  }

  const preview = await getEmployeeDeleteDependencyPreview(employeeId);
  if (preview.error) return { success: false, error: preview.error };
  if (!preview.data?.canDelete) {
    return {
      success: false,
      error: `This staff member has ${preview.data?.total ?? 0} linked record(s). Archive them instead.`,
    };
  }

  const { error } = await admin
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('organisation_id', orgId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'delete_employee',
    entityType: 'employee',
    entityId: employeeId,
  });

  return { success: true, error: null };
}
