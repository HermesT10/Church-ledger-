import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getFund, hasLinkedTransactions } from '@/lib/funds/actions';
import { EditFundForm } from '../edit-form';

export default async function FundEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await getActiveOrg();
  const { id } = await params;

  const fund = await getFund(id);
  if (!fund) notFound();

  const canEdit = role === 'admin' || role === 'treasurer';
  const hasTransactions = await hasLinkedTransactions(id);

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div>
        <Link href={`/funds/${id}`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Fund
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {canEdit ? 'Edit Fund' : 'Fund Details'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {fund.name}
        </p>
      </div>
      <EditFundForm
        fund={fund}
        canEdit={canEdit}
        hasTransactions={hasTransactions}
      />
    </div>
  );
}
