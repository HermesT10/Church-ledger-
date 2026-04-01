'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  createSupplierFull,
  updateSupplier,
  archiveSupplier,
  unarchiveSupplier,
} from '@/lib/suppliers/actions';
import type { SupplierWithStats } from '@/lib/suppliers/types';

interface Account {
  id: string;
  name: string;
  type: string;
}

interface Fund {
  id: string;
  name: string;
}

interface Props {
  accounts: Account[];
  funds: Fund[];
  supplier?: SupplierWithStats;
  mode: 'create' | 'edit';
}

export function SupplierEditForm({ accounts, funds, supplier, mode }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const isEdit = mode === 'edit' && !!supplier;
  const formAction = isEdit ? updateSupplier : createSupplierFull;

  return (
    <Card className="app-surface">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{isEdit ? 'Edit Supplier' : 'New Supplier'}</CardTitle>
            <CardDescription>
              {isEdit
                ? 'Update the supplier details below.'
                : 'Fill in the details for the new supplier.'}
            </CardDescription>
          </div>
          {isEdit && !supplier!.is_active && (
            <Badge className="bg-gray-100 text-gray-600 border-gray-200">Archived</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {isEdit && supplier!.invoice_count > 0 && (
          <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
            This supplier has {supplier!.invoice_count} invoice(s). It cannot be deleted — use archive instead.
          </div>
        )}

        <form className="flex flex-col gap-5">
          {isEdit && <input type="hidden" name="id" value={supplier!.id} />}

          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold">Basic information</p>
              <p className="text-xs text-muted-foreground">
                Contact details used across bills, payments, and supplier matching.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Supplier Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={supplier?.name ?? ''}
                  placeholder="e.g. Office Supplies Ltd"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  name="contact_name"
                  defaultValue={supplier?.contact_name ?? ''}
                  placeholder="e.g. John Smith"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={supplier?.email ?? ''}
                  placeholder="accounts@supplier.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={supplier?.phone ?? ''}
                  placeholder="020 1234 5678"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="address">Address</Label>
              <textarea
                id="address"
                name="address"
                defaultValue={supplier?.address ?? ''}
                placeholder="123 High Street, London, SW1A 1AA"
                rows={3}
                className="flex min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="bank_details">Bank Details</Label>
              <Input
                id="bank_details"
                name="bank_details"
                defaultValue={supplier?.bank_details ?? ''}
                placeholder="Sort code & account number"
              />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold">Default coding</p>
              <p className="text-xs text-muted-foreground">
                These values pre-fill new bills and help keep workflow entry consistent.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="default_account_id">Default Expense Account</Label>
                <select
                  id="default_account_id"
                  name="default_account_id"
                  defaultValue={supplier?.default_account_id ?? ''}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">None</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="default_fund_id">Default Fund</Label>
                <select
                  id="default_fund_id"
                  name="default_fund_id"
                  defaultValue={supplier?.default_fund_id ?? ''}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">None</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="app-toolbar border-t border-border/70 pt-5">
            <Button formAction={formAction}>
              {isEdit ? 'Save Changes' : 'Create Supplier'}
            </Button>

            {isEdit && supplier!.is_active && (
              <Button formAction={archiveSupplier} variant="outline">
                Archive
              </Button>
            )}

            {isEdit && !supplier!.is_active && (
              <Button formAction={unarchiveSupplier} variant="outline">
                Unarchive
              </Button>
            )}

            <Button asChild variant="outline">
              <Link href={isEdit ? `/suppliers/${supplier!.id}` : '/suppliers'}>
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
