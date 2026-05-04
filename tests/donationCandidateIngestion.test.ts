import { describe, expect, it } from 'vitest';
import type { DonationChannel } from '@/lib/donations/types';
import {
  classifyDonationCandidate,
  ingestDonationCandidatesWithRepository,
  type DonationCandidateBankLine,
  type DonationCandidateDonor,
  type DonationCandidateRepository,
  type ExistingDonationCandidate,
} from '@/lib/donations/candidate-ingestion';
import type { GiftAidDonationStatus } from '@/lib/giftaid/model';

type StoredDonation = ExistingDonationCandidate & {
  donation_date: string;
  amount_pence: number;
  channel: DonationChannel;
};

function createRepository(params: {
  defaultDonationsBankAccountId: string | null;
  bankLines: DonationCandidateBankLine[];
  donors: DonationCandidateDonor[];
  donations?: StoredDonation[];
}): DonationCandidateRepository & { donations: StoredDonation[] } {
  const donations = [...(params.donations ?? [])];

  return {
    donations,
    async getDefaultDonationsBankAccountId() {
      return params.defaultDonationsBankAccountId;
    },
    async listCandidateBankLines() {
      return [...params.bankLines];
    },
    async listActiveDonors() {
      return [...params.donors];
    },
    async listExistingDonationsByBankTransactionIds(_orgId, bankTransactionIds) {
      return donations.filter((donation) =>
        donation.bank_transaction_id
          ? bankTransactionIds.includes(donation.bank_transaction_id)
          : false
      );
    },
    async createDonationCandidate(input) {
      donations.push({
        id: `don-${donations.length + 1}`,
        bank_transaction_id: input.bankLine.id,
        donor_id: input.donorId,
        gift_aid_status: input.giftAidStatus,
        review_reason: input.reviewReason,
        donation_date: input.bankLine.txn_date,
        amount_pence: input.bankLine.amount_pence,
        channel: input.donationChannel,
      });
    },
    async updateDonationCandidate(input) {
      const donation = donations.find((item) => item.id === input.donationId);
      if (!donation) {
        throw new Error('Donation not found.');
      }
      donation.donor_id = input.donorId;
      donation.gift_aid_status = input.giftAidStatus;
      donation.review_reason = input.reviewReason;
      donation.donation_date = input.bankLine.txn_date;
      donation.amount_pence = input.bankLine.amount_pence;
      donation.channel = input.donationChannel;
    },
  };
}

describe('classifyDonationCandidate', () => {
  it('skips unrelated incoming transactions', () => {
    const decision = classifyDonationCandidate({
      bankLine: {
        id: 'line-1',
        bank_account_id: 'ba-1',
        txn_date: '2026-04-01',
        description: 'Bank transfer from reserve account',
        reference: 'INTERNAL',
        amount_pence: 5000,
        allocated: false,
      },
      defaultDonationsBankAccountId: 'ba-2',
      donorPatterns: [],
    });

    expect(decision.isCandidate).toBe(false);
  });
});

describe('ingestDonationCandidatesWithRepository', () => {
  it('creates a donation candidate for a likely giving bank line', async () => {
    const repository = createRepository({
      defaultDonationsBankAccountId: 'giving-ba',
      bankLines: [
        {
          id: 'line-1',
          bank_account_id: 'giving-ba',
          txn_date: '2026-04-01',
          description: 'Sunday offering',
          reference: 'Jane Smith tithe',
          amount_pence: 2500,
          allocated: false,
        },
      ],
      donors: [
        {
          id: 'donor-1',
          full_name: 'Jane Smith',
          email: 'jane@example.com',
        },
      ],
    });

    const result = await ingestDonationCandidatesWithRepository(repository, {
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.created).toBe(1);
    expect(repository.donations).toHaveLength(1);
    expect(repository.donations[0].bank_transaction_id).toBe('line-1');
    expect(repository.donations[0].gift_aid_status).toBe('needs_review');
    expect(repository.donations[0].donor_id).toBe('donor-1');
  });

  it('is idempotent across reruns for the same bank transaction', async () => {
    const repository = createRepository({
      defaultDonationsBankAccountId: 'giving-ba',
      bankLines: [
        {
          id: 'line-1',
          bank_account_id: 'giving-ba',
          txn_date: '2026-04-01',
          description: 'Donation received',
          reference: 'Smith family',
          amount_pence: 4000,
          allocated: false,
        },
      ],
      donors: [
        {
          id: 'donor-1',
          full_name: 'Smith Family',
          email: null,
        },
      ],
    });

    const firstRun = await ingestDonationCandidatesWithRepository(repository, {
      orgId: 'org-1',
      userId: 'user-1',
    });
    const secondRun = await ingestDonationCandidatesWithRepository(repository, {
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(firstRun.created).toBe(1);
    expect(secondRun.created).toBe(0);
    expect(secondRun.updated).toBe(1);
    expect(repository.donations).toHaveLength(1);
  });

  it('updates an existing donation row instead of creating a duplicate', async () => {
    const repository = createRepository({
      defaultDonationsBankAccountId: 'giving-ba',
      bankLines: [
        {
          id: 'line-1',
          bank_account_id: 'giving-ba',
          txn_date: '2026-04-01',
          description: 'Standing order giving',
          reference: 'john.smith',
          amount_pence: 3200,
          allocated: false,
        },
      ],
      donors: [
        {
          id: 'donor-1',
          full_name: 'John Smith',
          email: 'john.smith@example.com',
        },
      ],
      donations: [
        {
          id: 'don-1',
          bank_transaction_id: 'line-1',
          donor_id: null,
          gift_aid_status: 'unmatched' as GiftAidDonationStatus,
          review_reason: null,
          donation_date: '2026-04-01',
          amount_pence: 3200,
          channel: 'bank_transfer',
        },
      ],
    });

    const result = await ingestDonationCandidatesWithRepository(repository, {
      orgId: 'org-1',
      userId: 'user-1',
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(repository.donations).toHaveLength(1);
    expect(repository.donations[0].donor_id).toBe('donor-1');
    expect(repository.donations[0].gift_aid_status).toBe('needs_review');
  });
});
