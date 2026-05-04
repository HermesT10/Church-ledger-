import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  GIFT_AID_DECLARATION_WORDING,
  GIFT_AID_DONOR_NOTIFICATION_NOTES,
  poundsToPence,
} from './declaration-form';
import type { GiftAidDeclarationLinkStatus } from './types';

export const SELF_SERVICE_DECLARATION_TEXT_VERSION = 'church-ledger-gift-aid-2026-04';
export const DEFAULT_DECLARATION_LINK_EXPIRY_DAYS = 30;

export const declarationScopes = [
  'single',
  'future',
  'past_4_years_and_future',
] as const;

export type SelfServiceDeclarationScope = (typeof declarationScopes)[number];

export function generateDeclarationLinkToken() {
  return randomBytes(32).toString('base64url');
}

export function hashDeclarationLinkToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getDeclarationLinkStatus(params: {
  status: GiftAidDeclarationLinkStatus;
  expiresAt: string | Date;
  now?: Date;
}): GiftAidDeclarationLinkStatus {
  if (params.status !== 'active') return params.status;
  const now = params.now ?? new Date();
  const expiresAt =
    params.expiresAt instanceof Date
      ? params.expiresAt
      : new Date(params.expiresAt);
  return expiresAt <= now ? 'expired' : 'active';
}

export function buildDeclarationLinkExpiry(days = DEFAULT_DECLARATION_LINK_EXPIRY_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function scopeToDeclarationFields(params: {
  scope: SelfServiceDeclarationScope;
  submittedAt?: Date;
}) {
  const submittedAt = params.submittedAt ?? new Date();
  const submittedDate = submittedAt.toISOString().slice(0, 10);

  if (params.scope === 'single') {
    return {
      declarationType: 'single' as const,
      startDate: submittedDate,
      endDate: null,
      coversPastDonations: false,
    };
  }

  if (params.scope === 'past_4_years_and_future') {
    const start = new Date(submittedAt);
    start.setFullYear(start.getFullYear() - 4);
    return {
      declarationType: 'enduring' as const,
      startDate: start.toISOString().slice(0, 10),
      endDate: null,
      coversPastDonations: true,
    };
  }

  return {
    declarationType: 'enduring' as const,
    startDate: submittedDate,
    endDate: null,
    coversPastDonations: false,
  };
}

const requiredText = (message: string) => z.string().trim().min(1, message);
const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const selfServiceDeclarationSubmissionSchema = z
  .object({
    token: requiredText('Declaration link token is required.'),
    title: requiredText('Title is required.'),
    firstNameOrInitial: requiredText('First name or initials are required.'),
    surname: requiredText('Surname is required.'),
    fullHomeAddress: requiredText('Full home address is required.'),
    postcode: requiredText('Postcode is required.'),
    email: optionalText,
    declarationScope: z.enum(declarationScopes).default('future'),
    donationAmount: z.string().trim().optional().nullable(),
    taxpayerConfirmation: z.boolean().refine((value) => value === true, {
      message: 'You must confirm you are a UK taxpayer.',
    }),
    eSignatureName: requiredText('Typed full name is required as your e-signature.'),
  })
  .superRefine((value, ctx) => {
    if (value.declarationScope === 'single' && !poundsToPence(value.donationAmount ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['donationAmount'],
        message: 'Donation amount is required for a single donation declaration.',
      });
    }
  });

export type SelfServiceDeclarationSubmissionInput = z.input<
  typeof selfServiceDeclarationSubmissionSchema
>;

export type SelfServiceDeclarationSubmission = z.output<
  typeof selfServiceDeclarationSubmissionSchema
>;

export function parseSelfServiceDeclarationSubmission(
  input: SelfServiceDeclarationSubmissionInput
) {
  return selfServiceDeclarationSubmissionSchema.parse(input);
}

export function buildSelfServiceDeclarationWording() {
  return {
    declarationWording: GIFT_AID_DECLARATION_WORDING,
    donorNotificationNotes: GIFT_AID_DONOR_NOTIFICATION_NOTES,
    textVersion: SELF_SERVICE_DECLARATION_TEXT_VERSION,
  };
}

export function formatSelfServiceDeclarationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(' ');
  }
  return error instanceof Error
    ? error.message
    : 'Gift Aid declaration submission failed.';
}
