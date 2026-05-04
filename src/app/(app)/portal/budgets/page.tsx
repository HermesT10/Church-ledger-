import { requireCurrentPortalPage } from '@/lib/portal/current-user';
import { getPortalDashboardData } from '@/lib/portal/dashboard';
import { PortalEmpty, PortalSection } from '../portal-page-components';

function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export default async function PortalBudgetsPage() {
  await requireCurrentPortalPage('budgets');
  const data = await getPortalDashboardData();

  return (
    <PortalSection title="My Assigned Budgets" description="Budgets and categories your admin has assigned to you.">
      {data.assignedBudgets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.assignedBudgets.map((budget) => (
            <div key={budget.id} className="rounded-2xl border border-border/70 p-4">
              <p className="font-semibold">{budget.name}</p>
              <p className="text-sm text-muted-foreground">{budget.year} · {budget.canSubmitAgainst ? 'Can submit' : 'View only'}</p>
              <div className="mt-3 grid gap-2 text-sm">
                <span>Budget: {money(budget.budgetPence)}</span>
                <span>Used: {money(budget.usedPence)}</span>
                <span>Remaining: {money(budget.remainingPence)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : <PortalEmpty label="No budgets assigned yet." />}
    </PortalSection>
  );
}
