/* ------------------------------------------------------------------ */
/*  CSV Export Utilities                                                */
/* ------------------------------------------------------------------ */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null;
}

/**
 * Build a CSV string from data rows and column definitions.
 */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(',');

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        if (val === null || val === undefined) return '';
        return escapeCsvField(String(val));
      })
      .join(','),
  );

  return [header, ...dataRows].join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Format pence as pounds string for CSV export.
 */
export function penceToPoundsStr(pence: number): string {
  return (pence / 100).toFixed(2);
}
