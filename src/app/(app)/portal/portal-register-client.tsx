import Link from 'next/link';
import type { RegisterData, RegisterType } from '@/lib/registers/types';
import { SHORT_MONTH_LABELS } from '@/lib/registers/defaults';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function PortalRegisterClient({
  register,
  registerType,
  scopeLabel,
  permittedFunds,
  canSubmitExpenses,
  year,
}: {
  register: RegisterData | null;
  registerType: RegisterType;
  scopeLabel: string;
  permittedFunds: { id: string; name: string; type: string }[];
  canSubmitExpenses: boolean;
  year: number;
}) {
  const title = registerType === 'income' ? 'Income Register' : 'Expense Register';
  const baseHref = registerType === 'income' ? '/portal/income-register' : '/portal/expense-register';

  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only portal register filtered by your admin permissions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{scopeLabel}</Badge>
            <Badge variant="outline">{year}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`${baseHref}?year=${year - 1}`}>{year - 1}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`${baseHref}?year=${year + 1}`}>{year + 1}</Link></Button>
          {registerType === 'expense' && canSubmitExpenses ? (
            <Button asChild size="sm"><Link href="/portal/expenses">Submit expense</Link></Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {permittedFunds.length > 0 ? (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            <Button asChild variant="outline" size="sm"><Link href={`${baseHref}?year=${year}`}>Default scope</Link></Button>
            {permittedFunds.map((fund) => (
              <Button key={fund.id} asChild variant="outline" size="sm">
                <Link href={`${baseHref}?year=${year}&fundId=${fund.id}`}>{fund.name}</Link>
              </Button>
            ))}
          </div>
        ) : null}

        {register ? (
          <>
            <div className="mb-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Actual</p>
                <p className="mt-1 text-xl font-semibold">{money(register.totals.actualPence)}</p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Budget</p>
                <p className="mt-1 text-xl font-semibold">{money(register.totals.budgetPence)}</p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Variance</p>
                <p className="mt-1 text-xl font-semibold">{money(register.totals.variancePence)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    {SHORT_MONTH_LABELS.map((month) => <TableHead key={month}>{month}</TableHead>)}
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.rows.map((row) => (
                    <TableRow key={`${row.sourceType}-${row.categoryId}-${row.sourceId ?? 'category'}`}>
                      <TableCell>
                        <p className="font-medium">{row.name}</p>
                        {row.groupName ? <p className="text-xs text-muted-foreground">{row.groupName}</p> : null}
                      </TableCell>
                      {row.months.map((month) => <TableCell key={month.month}>{money(month.actualPence)}</TableCell>)}
                      <TableCell className="font-semibold">{money(row.totalActualPence)}</TableCell>
                    </TableRow>
                  ))}
                  {register.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                        No register rows are available for your current scope.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
            This register is not available for your current permissions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
