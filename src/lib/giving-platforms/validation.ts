/* ------------------------------------------------------------------ */
/*  Giving Platform Mapping Validation – pure function                 */
/* ------------------------------------------------------------------ */

export interface AccountForValidation {
  id: string;
  organisation_id: string;
  type: string; // 'income' | 'expense' | 'asset' | 'liability' | 'equity'
}

export interface PlatformMappingInput {
  organisationId: string;
  clearingAccount: AccountForValidation | null;
  feeAccount: AccountForValidation | null;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a giving platform mapping is correct:
 * 1. Both accounts must exist
 * 2. Both accounts must belong to the specified organisation
 * 3. Clearing account must be of type 'asset'
 * 4. Fee account must be of type 'expense'
 */
export function validatePlatformMapping(
  input: PlatformMappingInput
): ValidationResult {
  const { organisationId, clearingAccount, feeAccount } = input;

  // 1. Both accounts must exist
  if (!clearingAccount) {
    return { valid: false, error: 'Clearing account not found.' };
  }
  if (!feeAccount) {
    return { valid: false, error: 'Fee account not found.' };
  }

  // 2. Both accounts must belong to the organisation
  if (clearingAccount.organisation_id !== organisationId) {
    return {
      valid: false,
      error: 'Clearing account does not belong to this organisation.',
    };
  }
  if (feeAccount.organisation_id !== organisationId) {
    return {
      valid: false,
      error: 'Fee account does not belong to this organisation.',
    };
  }

  // 3. Clearing account must be type 'asset'
  if (clearingAccount.type !== 'asset') {
    return {
      valid: false,
      error: 'Clearing account must be an asset account.',
    };
  }

  // 4. Fee account must be type 'expense'
  if (feeAccount.type !== 'expense') {
    return {
      valid: false,
      error: 'Fee account must be an expense account.',
    };
  }

  return { valid: true };
}
