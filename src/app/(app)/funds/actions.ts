'use server';

// Re-export all fund actions from the canonical lib location.
export {
  createFund,
  updateFund,
  archiveFund,
  unarchiveFund,
  deleteFund,
} from '@/lib/funds/actions';
