'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrusteePackChart } from '@/lib/reports/trustee-packs/types';

function compactCurrency(value: number) {
  return (value / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export function TrusteePackChartView({ chart }: { chart: TrusteePackChart }) {
  if (chart.data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
        {chart.emptyState ?? 'No chart data available.'}
      </div>
    );
  }

  const data = chart.data.map((point) => ({
    name: point.label,
    value: point.value,
    secondaryValue: point.secondaryValue ?? 0,
  }));
  const isTrend = chart.type === 'income_vs_expenses' || chart.type === 'cash_trend';

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">{chart.title}</p>
        <p className="text-xs text-muted-foreground">{chart.description}</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {isTrend ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={compactCurrency} tickLine={false} axisLine={false} fontSize={12} width={72} />
              <Tooltip formatter={(value) => compactCurrency(Number(value))} />
              <Line type="monotone" dataKey="value" name="Income / cash" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="secondaryValue" name="Expenses" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={compactCurrency} tickLine={false} axisLine={false} fontSize={12} width={72} />
              <Tooltip formatter={(value) => compactCurrency(Number(value))} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
