import { redirect } from 'next/navigation';
import { ExportPackClient } from './export-pack-client';
import { exportReport } from '@/lib/reports/engine/service';
import type { ReportExportFormat } from '@/lib/reports/engine/types';

export default async function ExportPackPage({
  searchParams,
}: {
  searchParams?: Promise<{ report?: string; format?: string }>;
}) {
  const params = await searchParams;
  if (params?.report && params.format) {
    const format = params.format as ReportExportFormat;
    const result = await exportReport(params.report, format);
    if (result.data?.payload?.startsWith('/api/document-exports/')) {
      redirect(result.data.payload);
    }
  }

  return <ExportPackClient />;
}
