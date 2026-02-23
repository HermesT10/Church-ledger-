'use server';

// Re-export all account actions from the canonical lib location.
// This file exists for backward compatibility with imports from
// components in this directory tree.
export {
  createAccount,
  updateAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
} from '@/lib/accounts/actions';
