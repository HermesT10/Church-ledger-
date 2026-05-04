import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  declarationIdentityFieldsMatchBaseline,
  extractDonorProfileBaselineFromForm,
  listMissingDeclarationIdentityFields,
  mapDonorProfileToDeclarationFields,
} from '@/lib/giftaid/declaration-donor-mapping';

const BASE_DONOR = {
  id: 'd1',
  full_name: 'Jane Q Public',
  title: 'Mrs',
  first_name: 'Jane',
  last_name: 'Public',
  display_name: 'Jane Q Public',
  house_name_or_number: '12',
  address: 'High Street, Townshire',
  postcode: 'AB1 2CD',
  email: 'jane@example.com',
  phone: '07700900000',
};

describe('Gift Aid declaration donor autofill mapping', () => {
  it('maps structured donor fields and builds address', () => {
    const m = mapDonorProfileToDeclarationFields(BASE_DONOR, 'Test Charity');
    expect(m.donorTitle).toBe('Mrs');
    expect(m.donorFirstNameOrInitial).toBe('Jane');
    expect(m.donorSurname).toBe('Public');
    expect(m.donorFullHomeAddress).toBe('12, High Street, Townshire');
    expect(m.donorPostcode).toBe('AB1 2CD');
    expect(m.charityName).toBe('Test Charity');
    expect(m.missingStructuredName).toBe(false);
  });

  it('derives first and last from multi-word full_name when structured names absent', () => {
    const m = mapDonorProfileToDeclarationFields(
      {
        ...BASE_DONOR,
        first_name: null,
        last_name: null,
        full_name: 'Samuel Taylor Coleridge',
      },
      'Charity',
    );
    expect(m.donorFirstNameOrInitial).toBe('Samuel');
    expect(m.donorSurname).toBe('Coleridge');
    expect(m.missingStructuredName).toBe(false);
  });

  it('does not split single-token names and flags missing structured name', () => {
    const m = mapDonorProfileToDeclarationFields(
      {
        ...BASE_DONOR,
        first_name: null,
        last_name: null,
        full_name: 'Madonna',
        display_name: 'Madonna',
      },
      'Charity',
    );
    expect(m.donorFirstNameOrInitial).toBe('');
    expect(m.donorSurname).toBe('');
    expect(m.missingStructuredName).toBe(true);
  });

  it('lists missing identity fields', () => {
    expect(
      listMissingDeclarationIdentityFields({
        donorTitle: '',
        donorFirstNameOrInitial: 'A',
        donorSurname: '',
        donorFullHomeAddress: '1 St',
        donorPostcode: '',
      }).sort(),
    ).toEqual(['postcode', 'surname', 'title'].sort());
  });

  it('compares baseline identity fields', () => {
    const form = {
      donorTitle: 'Mr',
      donorFirstNameOrInitial: 'X',
      donorSurname: 'Y',
      donorFullHomeAddress: 'Here',
      donorPostcode: 'PC',
    };
    const baseline = extractDonorProfileBaselineFromForm(form);
    expect(declarationIdentityFieldsMatchBaseline(form, baseline)).toBe(true);
    expect(
      declarationIdentityFieldsMatchBaseline({ ...form, donorPostcode: 'PC2' }, baseline),
    ).toBe(false);
  });
});

describe('Gift Aid declaration server defaults (source strings)', () => {
  it('documents that blank-as-missing is implemented in actions.ts for withDeclarationDefaults', () => {
    const actions = readFileSync(join(process.cwd(), 'src/lib/giftaid/actions.ts'), 'utf8');
    expect(actions).toContain('declarationInputStringOrUndefined');
    expect(actions).toContain('syncDonorProfileFromGiftAidDeclaration');
    expect(actions).toContain('updateDonorProfile');
  });
});
