import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listBankAccountsWithStats } from '@/lib/banking/actions';
import {
  Landmark,
  CheckCircle,
  AlertCircle,
  CircleDollarSign,
  Upload,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BankAccountForm } from './bank-account-form';
import { SeedBankAccountsButton } from './seed-bank-accounts-button';

function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export default async function BankingPage() {
  const { orgId, role } = await getActiveOrg();
  const { data: accounts, error } = await listBankAccountsWithStats();
  const allAccounts = accounts ?? [];

  const canEdit = role === 'admin' || role === 'treasurer';

  const totalCount = allAccounts.length;
  const activeCount = allAccounts.filter((a) => a.is_active).length;
  const totalTransactions = allAccounts.reduce((sum, a) => sum + a.total_lines, 0);
  const totalUnallocated = allAccounts.reduce((sum, a) => sum + a.unallocated_count, 0);

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Bank Accounts"
        subtitle="Manage bank accounts, import statements, and allocate transactions."
        actions={
          <>
            {role === 'admin' && <SeedBankAccountsButton orgId={orgId} />}
            {canEdit && <BankAccountForm orgId={orgId} />}
          </>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Bank Accounts"
          value={totalCount}
          subtitle={`${activeCount} active`}
          href="/banking"
          tint="blue"
          icon={<Landmark size={20} />}
        />
        <StatCard
          title="Total Transactions"
          value={totalTransactions}
          subtitle="All imported lines"
          href="/banking"
          tint="violet"
          icon={<CircleDollarSign size={20} />}
        />
        <StatCard
          title="Allocated"
          value={totalTransactions - totalUnallocated}
          subtitle="Assigned to accounts"
          href="/banking"
          tint="emerald"
          icon={<CheckCircle size={20} />}
        />
        <StatCard
          title="Unallocated"
          value={totalUnallocated}
          subtitle="Pending allocation"
          href="/banking"
          tint="amber"
          icon={<AlertCircle size={20} />}
        />
      </div>

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      {/* Table */}
      {allAccounts.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Last 4</TableHead>
                <TableHead>Sort Code</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-center">Transactions</TableHead>
                <TableHead className="text-center">Unallocated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allAccounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link
                      href={`/banking/${account.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {account.account_number_last4 || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {account.sort_code || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{account.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {account.latest_balance_pence != null
                      ? `£${penceToPounds(account.latest_balance_pence)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {account.total_lines}
                  </TableCell>
                  <TableCell className="text-center">
                    {account.unallocated_count > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        {account.unallocated_count}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {account.is_active ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="sm" title="View transactions">
                        <Link href={`/banking/${account.id}`}>
                          <Eye size={14} />
                        </Link>
                      </Button>
                      {canEdit && (
                        <Button asChild variant="ghost" size="sm" title="Import CSV">
                          <Link href={`/banking/${account.id}/import`}>
                            <Upload size={14} />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No bank accounts found. {canEdit && 'Add one to get started.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
