import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { seedFunds, seedAccounts, seedGivingPlatforms } from './actions';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SEED_PREVIEW = [
  { name: 'General Fund', type: 'unrestricted' },
  { name: 'Friends In Need', type: 'restricted' },
  { name: 'Tanzania Project', type: 'restricted' },
  { name: 'Building Project', type: 'restricted' },
  { name: 'Seniors', type: 'restricted' },
  { name: 'URC Community Grant', type: 'restricted' },
  { name: 'Basketball', type: 'restricted' },
  { name: 'Youth', type: 'restricted' },
  { name: 'Maintenance Funds', type: 'restricted' },
  { name: 'Baptist Union', type: 'restricted' },
  { name: 'URC Funding', type: 'restricted' },
];

const SEED_ACCOUNTS_PREVIEW = [
  { code: 'INC-001', name: 'Donations-General', type: 'Income' },
  { code: 'INC-002', name: 'Donations-Restricted', type: 'Income' },
  { code: 'INC-003', name: 'Gift Aid', type: 'Income' },
  { code: 'INC-004', name: 'Lettings/Hall Hire', type: 'Income' },
  { code: 'INC-005', name: 'Grants', type: 'Income' },
  { code: 'INC-006', name: 'Fundraising/Events', type: 'Income' },
  { code: 'EXP-001', name: 'Salaries', type: 'Expense' },
  { code: 'EXP-002', name: 'Employer NIC', type: 'Expense' },
  { code: 'EXP-003', name: 'Pension', type: 'Expense' },
  { code: 'EXP-004', name: 'Utilities', type: 'Expense' },
  { code: 'EXP-005', name: 'Insurance', type: 'Expense' },
  { code: 'EXP-006', name: 'Maintenance & Repairs', type: 'Expense' },
  { code: 'EXP-007', name: 'Ministry Activities', type: 'Expense' },
  { code: 'EXP-008', name: 'Youth Activities', type: 'Expense' },
  { code: 'AST-001', name: 'Bank Account 1', type: 'Asset' },
  { code: 'AST-002', name: 'Bank Account 2', type: 'Asset' },
  { code: 'AST-003', name: 'Bank Account 3', type: 'Asset' },
  { code: 'LIA-001', name: 'Creditors/Accounts Payable', type: 'Liability' },
  { code: 'LIA-002', name: 'PAYE/NIC Liability', type: 'Liability' },
  { code: 'LIA-003', name: 'Pension Liability', type: 'Liability' },
  { code: 'LIA-004', name: 'Net Pay Liability', type: 'Liability' },
  { code: 'EQU-001', name: 'General Reserves', type: 'Equity' },
  { code: 'EQU-002', name: 'Restricted Reserves', type: 'Equity' },
];

const SEED_PLATFORMS_PREVIEW = [
  { code: 'CLR-GC', name: 'GoCardless Clearing', type: 'Asset' },
  { code: 'CLR-SU', name: 'SumUp Clearing', type: 'Asset' },
  { code: 'CLR-IZ', name: 'iZettle Clearing', type: 'Asset' },
  { code: 'EXP-FEE', name: 'Platform Fees', type: 'Expense' },
  { code: 'INC-DON', name: 'Donations Income', type: 'Income' },
];

export default async function SeedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;

  if (role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <PageShell className="max-w-lg">
      <PageHeader
        title="Seed Data"
        subtitle="Populate your organisation with default funds and accounts."
      />

      {params.error && (
        <SoftAlert variant="error">{params.error}</SoftAlert>
      )}

      {/* Seed Funds */}
      <Card className="border rounded-2xl shadow-sm bg-emerald-100/45 border-emerald-200/50">
        <CardHeader>
          <CardTitle>Seed Funds</CardTitle>
          <CardDescription>
            Populate your organisation with the default set of church funds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {SEED_PREVIEW.map((fund) => (
              <li key={fund.name} className="flex items-center gap-2">
                <span>{fund.name}</span>
                <Badge
                  variant={fund.type === 'unrestricted' ? 'secondary' : 'default'}
                >
                  {fund.type}
                </Badge>
              </li>
            ))}
          </ul>

          <form>
            <Button formAction={seedFunds}>Seed Funds</Button>
          </form>
        </CardContent>
      </Card>

      {/* Seed Accounts */}
      <Card className="border rounded-2xl shadow-sm bg-blue-100/45 border-blue-200/50">
        <CardHeader>
          <CardTitle>Seed Accounts</CardTitle>
          <CardDescription>
            Populate your organisation with the default chart of accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {SEED_ACCOUNTS_PREVIEW.map((account) => (
              <li key={account.code} className="flex items-center gap-2">
                <span className="font-mono text-xs">{account.code}</span>
                <span>{account.name}</span>
                <Badge variant="outline">{account.type}</Badge>
              </li>
            ))}
          </ul>

          <form>
            <Button formAction={seedAccounts}>Seed Accounts</Button>
          </form>
        </CardContent>
      </Card>

      {/* Seed Giving Platforms */}
      <Card className="border rounded-2xl shadow-sm bg-violet-100/45 border-violet-200/50">
        <CardHeader>
          <CardTitle>Seed Giving Platforms</CardTitle>
          <CardDescription>
            Create clearing accounts and map payment providers (GoCardless, SumUp, iZettle) for automated donation imports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {SEED_PLATFORMS_PREVIEW.map((account) => (
              <li key={account.code} className="flex items-center gap-2">
                <span className="font-mono text-xs">{account.code}</span>
                <span>{account.name}</span>
                <Badge variant="outline">{account.type}</Badge>
              </li>
            ))}
          </ul>

          <form>
            <Button formAction={seedGivingPlatforms}>Seed Giving Platforms</Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
