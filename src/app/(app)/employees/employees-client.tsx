'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  createEmployee,
  updateEmployee,
  archiveEmployee,
  unarchiveEmployee,
} from '@/lib/employees/actions';
import type { Employee } from '@/lib/employees/types';

interface Props {
  employees: Employee[];
  canEdit: boolean;
}

export function EmployeesClient({ employees, canEdit }: Props) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [niNumber, setNiNumber] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredEmployees = showArchived
    ? employees
    : employees.filter((e) => e.is_active);

  const resetForm = useCallback(() => {
    setFullName('');
    setNiNumber('');
    setTaxCode('');
    setRole('');
    setEditingId(null);
    setError(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((emp: Employee) => {
    setFullName(emp.full_name);
    setNiNumber(emp.ni_number ?? '');
    setTaxCode(emp.tax_code ?? '');
    setRole(emp.role ?? '');
    setEditingId(emp.id);
    setError(null);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const res = await updateEmployee(editingId, {
          fullName,
          niNumber,
          taxCode,
          role,
        });
        if (!res.success) {
          setError(res.error ?? 'Failed to update employee.');
          return;
        }
      } else {
        const res = await createEmployee({
          fullName,
          niNumber,
          taxCode,
          role,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      setDialogOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [editingId, fullName, niNumber, taxCode, role, resetForm, router]);

  const handleArchive = useCallback(
    async (id: string, isActive: boolean) => {
      const res = isActive
        ? await archiveEmployee(id)
        : await unarchiveEmployee(id);
      if (res.success) router.refresh();
    },
    [router],
  );

  return (
    <>
      <div className="flex items-center gap-3">
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>Add Employee</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Edit Employee' : 'New Employee'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div>
                  <Label htmlFor="emp-name">Full Name *</Label>
                  <Input
                    id="emp-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="emp-ni">NI Number</Label>
                  <Input
                    id="emp-ni"
                    value={niNumber}
                    onChange={(e) => setNiNumber(e.target.value)}
                    placeholder="e.g. AB123456C"
                  />
                </div>
                <div>
                  <Label htmlFor="emp-tax">Tax Code</Label>
                  <Input
                    id="emp-tax"
                    value={taxCode}
                    onChange={(e) => setTaxCode(e.target.value)}
                    placeholder="e.g. 1257L"
                  />
                </div>
                <div>
                  <Label htmlFor="emp-role">Role</Label>
                  <Input
                    id="emp-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Minister, Administrator"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {filteredEmployees.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>NI Number</TableHead>
                <TableHead>Tax Code</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((emp) => (
                <TableRow key={emp.id} className={!emp.is_active ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">{emp.full_name}</TableCell>
                  <TableCell>{emp.ni_number ?? '—'}</TableCell>
                  <TableCell>{emp.tax_code ?? '—'}</TableCell>
                  <TableCell>{emp.role ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                      {emp.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(emp)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchive(emp.id, emp.is_active)}
                        >
                          {emp.is_active ? 'Archive' : 'Restore'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No employees found. {canEdit && 'Add one to get started.'}
        </div>
      )}
    </>
  );
}
