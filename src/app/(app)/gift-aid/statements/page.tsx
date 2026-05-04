import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import {
  listDonorStatementRuns,
  listDonorStatements,
} from '@/lib/giftaid/donor-statements-actions';
import { GiftAidStatementsClient } from './statements-client';

export default async function GiftAidStatementsPage() {
  const { role } = await getActiveOrg();
  const canEdit = canExportGiftAid(role).allowed;

  const [{ data: runs, error: runErr }, { data: statements, error: stmtErr }] =
    await Promise.all([listDonorStatementRuns(), listDonorStatements()]);

  return (
    <GiftAidStatementsClient
      initialRuns={runs}
      initialStatements={statements}
      runsError={runErr}
      statementsError={stmtErr}
      canEdit={canEdit}
    />
  );
}
