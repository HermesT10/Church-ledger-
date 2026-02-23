import { Suspense } from 'react';
import { getAccountsList } from '@/lib/accounts/actions';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/lib/accounts/types';
import { NewAccountFormClient } from './new-account-form';

export default async function NewAccountPage() {
  const accounts = await getAccountsList({ activeOnly: true });

  return (
    <Suspense>
      <NewAccountFormClient existingAccounts={accounts} />
    </Suspense>
  );
}
