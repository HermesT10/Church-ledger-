import type { RegisterType } from './types';

export interface RegisterLineForAggregation {
  id: string;
  accountId: string;
  accountType: string;
  month: number;
  debitPence: number;
  creditPence: number;
  categoryId: string | null;
}

export interface RegisterAggregationCell {
  month: number;
  actualPence: number;
}

export function emptyRegisterCells(): RegisterAggregationCell[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    actualPence: 0,
  }));
}

export function netRegisterAmount(type: RegisterType, debitPence: number, creditPence: number): number {
  return type === 'income' ? creditPence - debitPence : debitPence - creditPence;
}

export function aggregateRegisterLines(
  type: RegisterType,
  lines: RegisterLineForAggregation[],
): Record<string, RegisterAggregationCell[]> {
  const result: Record<string, RegisterAggregationCell[]> = {};
  for (const line of lines) {
    if (line.accountType !== type) continue;
    const categoryId = line.categoryId ?? 'uncategorized';
    if (!result[categoryId]) result[categoryId] = emptyRegisterCells();
    result[categoryId][line.month - 1].actualPence += netRegisterAmount(type, line.debitPence, line.creditPence);
  }
  return result;
}
