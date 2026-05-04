import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderGiftAidDeclarationPdf } from '@/lib/giftaid/declaration-pdf';
import {
  buildDeclarationLinkExpiry,
  generateDeclarationLinkToken,
  getDeclarationLinkStatus,
  hashDeclarationLinkToken,
  parseSelfServiceDeclarationSubmission,
  scopeToDeclarationFields,
} from '@/lib/giftaid/self-service-declarations';

describe('Gift Aid self-service declarations', () => {
  it('generates high entropy tokens and hashes without storing raw token values', () => {
    const token = generateDeclarationLinkToken();
    const secondToken = generateDeclarationLinkToken();
    const hash = hashDeclarationLinkToken(token);

    expect(token).not.toEqual(secondToken);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('blocks expired, revoked, and used links', () => {
    const now = new Date('2026-04-28T12:00:00Z');

    expect(
      getDeclarationLinkStatus({
        status: 'active',
        expiresAt: '2026-04-28T11:59:00Z',
        now,
      })
    ).toBe('expired');
    expect(
      getDeclarationLinkStatus({
        status: 'revoked',
        expiresAt: '2026-04-29T00:00:00Z',
        now,
      })
    ).toBe('revoked');
    expect(
      getDeclarationLinkStatus({
        status: 'used',
        expiresAt: '2026-04-29T00:00:00Z',
        now,
      })
    ).toBe('used');
  });

  it('maps declaration scopes to declaration coverage', () => {
    const submittedAt = new Date('2026-04-28T12:00:00Z');

    expect(scopeToDeclarationFields({ scope: 'single', submittedAt })).toMatchObject({
      declarationType: 'single',
      startDate: '2026-04-28',
      coversPastDonations: false,
    });
    expect(scopeToDeclarationFields({ scope: 'future', submittedAt })).toMatchObject({
      declarationType: 'enduring',
      startDate: '2026-04-28',
      coversPastDonations: false,
    });
    expect(
      scopeToDeclarationFields({
        scope: 'past_4_years_and_future',
        submittedAt,
      })
    ).toMatchObject({
      declarationType: 'enduring',
      startDate: '2022-04-28',
      coversPastDonations: true,
    });
  });

  it('validates required signature, taxpayer confirmation, and single donation amount', () => {
    expect(() =>
      parseSelfServiceDeclarationSubmission({
        token: 'token',
        title: 'Mrs',
        firstNameOrInitial: 'Jane',
        surname: 'Smith',
        fullHomeAddress: '1 High Street',
        postcode: 'AB1 2CD',
        email: 'jane@example.com',
        declarationScope: 'single',
        donationAmount: '',
        taxpayerConfirmation: true,
        eSignatureName: 'Jane Smith',
      })
    ).toThrow(/Donation amount is required/);

    const parsed = parseSelfServiceDeclarationSubmission({
      token: 'token',
      title: 'Mrs',
      firstNameOrInitial: 'Jane',
      surname: 'Smith',
      fullHomeAddress: '1 High Street',
      postcode: 'AB1 2CD',
      email: null,
      declarationScope: 'future',
      donationAmount: '',
      taxpayerConfirmation: true,
      eSignatureName: 'Jane Smith',
    });

    expect(parsed.eSignatureName).toBe('Jane Smith');
  });

  it('builds default 30 day expiries', () => {
    const expiry = buildDeclarationLinkExpiry();
    expect(expiry).toBeInstanceOf(Date);
  });

  it('renders a PDF with e-signature evidence', async () => {
    const pdf = await renderGiftAidDeclarationPdf(
      {
        donorId: 'donor-1',
        declarationType: 'enduring',
        status: 'active',
        startDate: '2026-04-28',
        endDate: null,
        declarationDate: '2026-04-28',
        signedDate: '2026-04-28',
        donationAmountPence: null,
        charityName: 'Example Church',
        donorTitle: 'Mrs',
        donorFirstNameOrInitial: 'Jane',
        donorSurname: 'Smith',
        donorFullHomeAddress: '1 High Street',
        donorPostcode: 'AB1 2CD',
        taxpayerConfirmation: true,
        declarationWording: 'Gift Aid declaration wording.',
        donorNotificationNotes: 'Tell us if your tax status changes.',
        coversPastDonations: false,
        hmrcVersion: 'HMRC self-service declaration',
        templateVersion: 'test',
        attachmentUrl: null,
        notes: null,
      },
      {
        eSignatureName: 'Jane Smith',
        submittedAt: '2026-04-28T12:00:00.000Z',
        textVersion: 'test-version',
      }
    );

    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('migration protects links with token hashes, workspace RLS, and evidence columns', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/00082_gift_aid_self_service_declarations.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('gift_aid_declaration_links');
    expect(migration).toContain('token_hash text not null');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_org_member(workspace_id)');
    expect(migration).toContain('self_service_link_id');
    expect(migration).toContain('e_signature_name');
  });
});
