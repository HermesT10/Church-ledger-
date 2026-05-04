/**
 * Maps donor profile rows to Gift Aid declaration form fields (no I/O).
 */

export type GiftAidDeclarationDonorRow = {
  id: string;
  full_name: string;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  house_name_or_number: string | null;
  address: string | null;
  postcode: string | null;
  email: string | null;
  phone: string | null;
};

export type DonorProfileBaseline = {
  donorTitle: string;
  donorFirstNameOrInitial: string;
  donorSurname: string;
  donorFullHomeAddress: string;
  donorPostcode: string;
};

export type MapDonorToDeclarationFieldsResult = {
  donorTitle: string;
  donorFirstNameOrInitial: string;
  donorSurname: string;
  donorFullHomeAddress: string;
  donorPostcode: string;
  charityName: string;
  /** True when structured name is missing and we did not derive safe first/last from full_name. */
  missingStructuredName: boolean;
};

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function joinFullAddress(donor: GiftAidDeclarationDonorRow): string {
  return [donor.house_name_or_number, donor.address].filter(Boolean).join(', ');
}

/**
 * Derives declaration identity fields from a donor profile.
 * Does not split single-token names into first/last (HMRC-style fields stay empty; UI shows warning).
 */
export function mapDonorProfileToDeclarationFields(
  donor: GiftAidDeclarationDonorRow,
  charityNameDefault: string,
): MapDonorToDeclarationFieldsResult {
  const first = trimOrEmpty(donor.first_name);
  const last = trimOrEmpty(donor.last_name);
  const title = trimOrEmpty(donor.title);
  const postcode = trimOrEmpty(donor.postcode);
  const fullAddress = joinFullAddress(donor);

  let donorFirstNameOrInitial = first;
  let donorSurname = last;
  let missingStructuredName = false;

  if (!first && !last) {
    const raw = trimOrEmpty(donor.full_name) || trimOrEmpty(donor.display_name);
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      donorFirstNameOrInitial = tokens[0] ?? '';
      donorSurname = tokens[tokens.length - 1] ?? '';
    } else {
      missingStructuredName = true;
      donorFirstNameOrInitial = '';
      donorSurname = '';
    }
  }

  return {
    donorTitle: title,
    donorFirstNameOrInitial,
    donorSurname,
    donorFullHomeAddress: fullAddress,
    donorPostcode: postcode,
    charityName: trimOrEmpty(charityNameDefault),
    missingStructuredName,
  };
}

export type MissingDeclarationIdentityField =
  | 'title'
  | 'first name'
  | 'surname'
  | 'address'
  | 'postcode';

export function listMissingDeclarationIdentityFields(form: {
  donorTitle: string;
  donorFirstNameOrInitial: string;
  donorSurname: string;
  donorFullHomeAddress: string;
  donorPostcode: string;
}): MissingDeclarationIdentityField[] {
  const missing: MissingDeclarationIdentityField[] = [];
  if (!form.donorTitle.trim()) missing.push('title');
  if (!form.donorFirstNameOrInitial.trim()) missing.push('first name');
  if (!form.donorSurname.trim()) missing.push('surname');
  if (!form.donorFullHomeAddress.trim()) missing.push('address');
  if (!form.donorPostcode.trim()) missing.push('postcode');
  return missing;
}

export function declarationIdentityFieldsMatchBaseline(
  form: DonorProfileBaseline,
  baseline: DonorProfileBaseline | null,
): boolean {
  if (!baseline) return true;
  return (
    form.donorTitle === baseline.donorTitle &&
    form.donorFirstNameOrInitial === baseline.donorFirstNameOrInitial &&
    form.donorSurname === baseline.donorSurname &&
    form.donorFullHomeAddress === baseline.donorFullHomeAddress &&
    form.donorPostcode === baseline.donorPostcode
  );
}

export function extractDonorProfileBaselineFromForm(form: {
  donorTitle: string;
  donorFirstNameOrInitial: string;
  donorSurname: string;
  donorFullHomeAddress: string;
  donorPostcode: string;
}): DonorProfileBaseline {
  return {
    donorTitle: form.donorTitle,
    donorFirstNameOrInitial: form.donorFirstNameOrInitial,
    donorSurname: form.donorSurname,
    donorFullHomeAddress: form.donorFullHomeAddress,
    donorPostcode: form.donorPostcode,
  };
}
