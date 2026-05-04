import { describe, expect, it } from 'vitest';
import { evaluateGiftAidReminderCandidates } from '@/lib/giftaid/declaration-reminders';

describe('Gift Aid declaration reminders', () => {
  it('flags missing signed copies when required by settings', () => {
    const rows = evaluateGiftAidReminderCandidates({
      settings: {
        gift_aid_reminder_stale_declaration_days: 365,
        gift_aid_reminder_no_donation_days: 540,
        gift_aid_require_signed_declaration_copy: true,
      },
      declarations: [
        {
          id: 'd1',
          donor_id: 'donor-1',
          status: 'active',
          start_date: '2026-01-01',
          end_date: null,
          declaration_date: '2026-01-01',
          signed_date: '2026-01-01',
          attachment_url: null,
          generated_pdf_storage_path: null,
        },
      ],
      donors: [{ id: 'donor-1', postcode: 'AB1 2CD' }],
      donorLatestPostedDonationIso: new Map(),
      donorHasPostedDonationsInRollingWindow: new Map(),
      now: new Date('2026-06-01'),
    });
    expect(rows.some((r) => r.reminder_type === 'missing_signed_copy')).toBe(true);
  });

  it('emits a cancellation follow-up when donor has no active declarations', () => {
    const rows = evaluateGiftAidReminderCandidates({
      settings: {
        gift_aid_reminder_stale_declaration_days: 365,
        gift_aid_reminder_no_donation_days: 540,
        gift_aid_require_signed_declaration_copy: false,
      },
      declarations: [
        {
          id: 'cancelled-1',
          donor_id: 'donor-9',
          status: 'cancelled',
          start_date: '2025-01-01',
          end_date: '2026-01-01',
          declaration_date: '2025-01-01',
          signed_date: '2025-01-01',
          attachment_url: null,
          generated_pdf_storage_path: null,
        },
      ],
      donors: [{ id: 'donor-9', postcode: 'ZZ1 1ZZ' }],
      donorLatestPostedDonationIso: new Map([['donor-9', '2026-01-12']]),
      donorHasPostedDonationsInRollingWindow: new Map([['donor-9', true]]),
      now: new Date('2026-06-01'),
    });
    expect(rows.some((r) => r.reminder_type === 'declaration_cancelled_followup')).toBe(true);
  });
});
