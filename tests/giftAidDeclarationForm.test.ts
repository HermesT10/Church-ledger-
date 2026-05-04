import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GIFT_AID_DECLARATION_WORDING,
  GIFT_AID_DONOR_NOTIFICATION_NOTES,
  giftAidDeclarationFormSchema,
  poundsToPence,
} from '@/lib/giftaid/declaration-form';

const VALID_DECLARATION = {
  donorId: 'donor-1',
  declarationType: 'single' as const,
  status: 'draft' as const,
  startDate: '2026-04-28',
  endDate: null,
  declarationDate: '2026-04-28',
  signedDate: '2026-04-28',
  donationAmountPence: 2500,
  charityName: 'St Example Church',
  donorTitle: 'Mrs',
  donorFirstNameOrInitial: 'J',
  donorSurname: 'Smith',
  donorFullHomeAddress: '1 Church Street, London',
  donorPostcode: 'SW1A 1AA',
  taxpayerConfirmation: true as const,
  declarationWording: GIFT_AID_DECLARATION_WORDING,
  donorNotificationNotes: GIFT_AID_DONOR_NOTIFICATION_NOTES,
  coversPastDonations: false,
  hmrcVersion: null,
  templateVersion: null,
  attachmentUrl: null,
  notes: null,
};

describe('Gift Aid declaration form validation', () => {
  it('accepts a complete HMRC-style single donation declaration', () => {
    const result = giftAidDeclarationFormSchema.parse(VALID_DECLARATION);
    expect(result.charityName).toBe('St Example Church');
    expect(result.donationAmountPence).toBe(2500);
  });

  it('requires donor identity, address, date, charity, amount, and taxpayer confirmation', () => {
    const result = giftAidDeclarationFormSchema.safeParse({
      ...VALID_DECLARATION,
      donationAmountPence: null,
      charityName: '',
      donorTitle: '',
      donorFirstNameOrInitial: '',
      donorSurname: '',
      donorFullHomeAddress: '',
      donorPostcode: '',
      signedDate: '',
      taxpayerConfirmation: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('Charity name is required');
      expect(messages).toContain('Donor title is required');
      expect(messages).toContain('First name or initials are required');
      expect(messages).toContain('Surname is required');
      expect(messages).toContain('Full home address is required');
      expect(messages).toContain('Postcode is required');
      expect(messages).toContain('Signed date is required');
      expect(messages).toContain('Taxpayer confirmation is required');
    }
  });

  it('requires donation amount for a single donation declaration', () => {
    const result = giftAidDeclarationFormSchema.safeParse({
      ...VALID_DECLARATION,
      donationAmountPence: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain(
        'Donation amount is required'
      );
    }
  });

  it('normalises pound inputs to integer pence', () => {
    expect(poundsToPence('£1,234.56')).toBe(123456);
    expect(poundsToPence('')).toBeNull();
    expect(poundsToPence('-1')).toBeNull();
  });
});

describe('Gift Aid declaration schema migration', () => {
  it('adds declaration statuses, documents, private storage, and RLS safeguards', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/00076_gift_aid_declaration_documents.sql'),
      'utf8'
    );

    expect(sql).toContain("add value 'draft'");
    expect(sql).toContain("add value 'invalid'");
    expect(sql).toContain('create table if not exists public.gift_aid_declaration_documents');
    expect(sql).toContain('alter table public.gift_aid_declaration_documents enable row level security');
    expect(sql).toContain("values ('gift-aid', 'gift-aid', false)");
    expect(sql).toContain('public.is_org_member(organisation_id)');
    expect(sql).toContain('public.is_org_treasurer_or_admin(organisation_id)');
  });
});
