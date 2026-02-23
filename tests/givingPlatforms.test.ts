import { describe, it, expect } from 'vitest';
import {
  validatePlatformMapping,
  type AccountForValidation,
  type PlatformMappingInput,
} from '../src/lib/giving-platforms/validation';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ORG_ID = 'org-aaa-111';
const OTHER_ORG_ID = 'org-bbb-222';

function makeAccount(
  overrides: Partial<AccountForValidation> = {}
): AccountForValidation {
  return {
    id: 'acc-111',
    organisation_id: ORG_ID,
    type: 'asset',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('validatePlatformMapping', () => {
  it('returns valid for correct asset clearing + expense fee accounts', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'asset' }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'expense' }),
    };
    expect(validatePlatformMapping(input)).toEqual({ valid: true });
  });

  it('rejects missing clearing account', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: null,
      feeAccount: makeAccount({ id: 'acc-fee', type: 'expense' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Clearing account not found');
  });

  it('rejects missing fee account', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'asset' }),
      feeAccount: null,
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Fee account not found');
  });

  it('rejects clearing account from another organisation', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({
        id: 'acc-clr',
        type: 'asset',
        organisation_id: OTHER_ORG_ID,
      }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'expense' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Clearing account does not belong');
  });

  it('rejects fee account from another organisation', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'asset' }),
      feeAccount: makeAccount({
        id: 'acc-fee',
        type: 'expense',
        organisation_id: OTHER_ORG_ID,
      }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Fee account does not belong');
  });

  it('rejects clearing account that is not type asset', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'income' }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'expense' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Clearing account must be an asset');
  });

  it('rejects fee account that is not type expense', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'asset' }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'asset' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Fee account must be an expense');
  });

  it('rejects clearing account typed as liability', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'liability' }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'expense' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Clearing account must be an asset');
  });

  it('rejects fee account typed as income', () => {
    const input: PlatformMappingInput = {
      organisationId: ORG_ID,
      clearingAccount: makeAccount({ id: 'acc-clr', type: 'asset' }),
      feeAccount: makeAccount({ id: 'acc-fee', type: 'income' }),
    };
    const result = validatePlatformMapping(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Fee account must be an expense');
  });
});
