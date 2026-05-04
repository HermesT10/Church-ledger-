import { z } from 'zod';

export const GIFT_AID_DECLARATION_WORDING =
  'I want to Gift Aid my donation and any donations I make in the future or have made in the past 4 years to this charity. I am a UK taxpayer and understand that if I pay less Income Tax and/or Capital Gains Tax than the amount of Gift Aid claimed on all my donations in that tax year it is my responsibility to pay any difference.';

export const GIFT_AID_DONOR_NOTIFICATION_NOTES =
  'Please notify the charity if you want to cancel this declaration, change your name or home address, or no longer pay sufficient tax on your income and/or capital gains.';

export const DECLARATION_STATUSES = [
  'draft',
  'active',
  'cancelled',
  'expired',
  'invalid',
] as const;

export type GiftAidDeclarationStatus = (typeof DECLARATION_STATUSES)[number];

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const requiredText = (message: string) =>
  z.string().trim().min(1, message);

export const giftAidDeclarationFormSchema = z
  .object({
    donorId: requiredText('Select a donor.'),
    declarationType: z.enum(['single', 'enduring', 'oral']).default('single'),
    status: z.enum(DECLARATION_STATUSES).default('draft'),
    startDate: requiredText('Valid from date is required.'),
    endDate: optionalText,
    declarationDate: requiredText('Signed date is required.'),
    signedDate: requiredText('Signed date is required.'),
    donationAmountPence: z.number().int().positive().nullable().optional(),
    charityName: requiredText('Charity name is required.'),
    donorTitle: requiredText('Donor title is required.'),
    donorFirstNameOrInitial: requiredText('First name or initials are required.'),
    donorSurname: requiredText('Surname is required.'),
    donorFullHomeAddress: requiredText('Full home address is required.'),
    donorPostcode: requiredText('Postcode is required.'),
    taxpayerConfirmation: z.literal(true, {
      error: 'Taxpayer confirmation is required.',
    }),
    declarationWording: requiredText('Gift Aid declaration wording is required.'),
    donorNotificationNotes: requiredText('Donor notification notes are required.'),
    coversPastDonations: z.boolean().default(false),
    hmrcVersion: optionalText,
    templateVersion: optionalText,
    attachmentUrl: optionalText,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.declarationType === 'single' && !value.donationAmountPence) {
      ctx.addIssue({
        code: 'custom',
        path: ['donationAmountPence'],
        message: 'Donation amount is required for a single donation declaration.',
      });
    }
  });

export type GiftAidDeclarationFormInput = z.input<
  typeof giftAidDeclarationFormSchema
>;

export type GiftAidDeclarationFormData = z.output<
  typeof giftAidDeclarationFormSchema
>;

export function poundsToPence(value: string) {
  const normalized = value.trim().replace(/[£,\s]/g, '');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function penceToPoundsInput(value: number | null | undefined) {
  if (!value) return '';
  return (value / 100).toFixed(2);
}

export function formatDeclarationValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(' ');
  }
  return error instanceof Error ? error.message : 'Declaration validation failed.';
}
