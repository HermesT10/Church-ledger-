import { NextRequest, NextResponse } from 'next/server';
import { getRegisterData } from '@/lib/registers/actions';
import { SHORT_MONTH_LABELS } from '@/lib/registers/defaults';
import type { RegisterGroupBy, RegisterType } from '@/lib/registers/types';

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const type = search.get('type') === 'expense' ? 'expense' : 'income';
  const year = Number.parseInt(search.get('year') ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const fundId = search.get('fundId');
  const comparisonYear = search.get('compare') ? Number.parseInt(search.get('compare')!, 10) : null;
  const groupBy = (['category', 'supplier', 'account', 'fund'].includes(search.get('groupBy') ?? '')
    ? search.get('groupBy')
    : 'category') as RegisterGroupBy;

  const result = await getRegisterData({
    registerType: type as RegisterType,
    year,
    comparisonYear,
    fundId: fundId || null,
    groupBy,
  });
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Unable to export register.' }, { status: 400 });
  }

  const rows = [
    ['Register', type],
    ['Year', year],
    ['Group by', groupBy],
    ['Generated at', new Date().toISOString()],
    [],
    ['Row', 'Group', ...SHORT_MONTH_LABELS, 'Total actual', 'Total budget', 'Total variance'],
    ...result.data.rows.map((row) => [
      row.name,
      row.groupName ?? '',
      ...row.months.map((month) => (month.actualPence / 100).toFixed(2)),
      (row.totalActualPence / 100).toFixed(2),
      (row.totalBudgetPence / 100).toFixed(2),
      (row.totalVariancePence / 100).toFixed(2),
    ]),
    [
      'Monthly total',
      '',
      ...result.data.monthlyTotals.map((month) => (month.actualPence / 100).toFixed(2)),
      (result.data.totals.actualPence / 100).toFixed(2),
      (result.data.totals.budgetPence / 100).toFixed(2),
      (result.data.totals.variancePence / 100).toFixed(2),
    ],
  ];

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${type}-register-${year}.csv"`,
    },
  });
}
