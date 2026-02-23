import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getAccount, getAccountsList, hasLinkedTransactions } from '@/lib/accounts/actions';
import { EditAccountForm } from './edit-form';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await getActiveOrg();
  const { id } = await params;

  const account = await getAccount(id);
  if (!account) notFound();

  const canEdit = role === 'admin' || role === 'treasurer';

  // Fetch sibling accounts for parent dropdown (same type, active, excluding self)
  const siblingAccounts = await getAccountsList({ type: account.type, activeOnly: true });
  const parentCandidates = siblingAccounts.filter(
    (a) => a.id !== account.id && !a.parent_id,
  );

  // Check if account has linked transactions (for delete protection)
  const hasTransactions = await hasLinkedTransactions(id);

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div>
        <Link href="/accounts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Accounts
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {canEdit ? 'Edit Account' : 'Account Details'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {account.code} &mdash; {account.name}
        </p>
      </div>
      <EditAccountForm
        account={account}
        canEdit={canEdit}
        parentCandidates={parentCandidates}
        hasTransactions={hasTransactions}
      />
    </div>
  );
}
