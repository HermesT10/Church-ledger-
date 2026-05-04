import type { SupabaseClient } from '@supabase/supabase-js';

/** Dedupe ids must remain stable across sync runs. */
export type GiftAidReminderDedupePrefix =
  | 'missing_signed_copy'
  | 'stale_declaration_after_giving'
  | 'declaration_inactive_giving'
  | 'declaration_cancelled_followup'
  | 'missing_donor_postcode';

export interface GiftAidReminderSettingsRow {
  gift_aid_reminder_stale_declaration_days: number;
  gift_aid_reminder_no_donation_days: number;
  gift_aid_require_signed_declaration_copy: boolean;
}

export interface GiftAidReminderCandidate {
  donor_id: string | null;
  declaration_id: string | null;
  donation_id: string | null;
  reminder_type: GiftAidReminderDedupePrefix | string;
  severity: 'info' | 'warning' | 'urgent';
  message: string;
  due_date: string | null;
  dedupe_key: string;
}

function parseDateBoundary(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(dateStr: string, now: Date): number {
  const d = parseDateBoundary(dateStr);
  if (!d) return Infinity;
  return Math.floor((now.getTime() - d.getTime()) / (86400 * 1000));
}

function buildDedupe(
  prefix: GiftAidReminderDedupePrefix,
  parts: Record<string, string | null | undefined>
): string {
  const suffix = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v ?? 'none')
    .join('|');
  return `${prefix}:${suffix}`;
}

export function evaluateGiftAidReminderCandidates(params: {
  settings: GiftAidReminderSettingsRow;
  declarations: Array<{
    id: string;
    donor_id: string;
    status: string;
    start_date: string;
    end_date: string | null;
    declaration_date: string | null;
    signed_date: string | null;
    attachment_url: string | null;
    generated_pdf_storage_path: string | null;
  }>;
  donors: Array<{ id: string; postcode: string | null }>;
  donorLatestPostedDonationIso: Map<string, string>;
  donorHasPostedDonationsInRollingWindow: Map<string, boolean>;
  /** Donations roughly in the last ~18 months (computed by caller). */
  now?: Date;
}): GiftAidReminderCandidate[] {
  const now = params.now ?? new Date();
  const staleDays = params.settings.gift_aid_reminder_stale_declaration_days;
  const noDonationDays = params.settings.gift_aid_reminder_no_donation_days;
  const requireSigned = params.settings.gift_aid_require_signed_declaration_copy;

  const candidates: GiftAidReminderCandidate[] = [];

  const activeForDonor = new Map<string, boolean>();
  for (const d of params.declarations) {
    if (d.status === 'active') {
      activeForDonor.set(d.donor_id, true);
    }
  }

  for (const decl of params.declarations) {
    if (decl.status === 'active') {
      const hasDoc = Boolean(decl.attachment_url || decl.generated_pdf_storage_path);
      if (requireSigned && !hasDoc) {
        candidates.push({
          donor_id: decl.donor_id,
          declaration_id: decl.id,
          donation_id: null,
          reminder_type: 'missing_signed_copy',
          severity: 'warning',
          message:
            'Upload a signed declaration copy (scan or PDF) so HMRC evidence is on file before claiming.',
          due_date: null,
          dedupe_key: buildDedupe('missing_signed_copy', { d: decl.id }),
        });
      }

      const ref =
        decl.signed_date ?? decl.declaration_date ?? decl.start_date;
      const refAge = daysSince(ref, now);
      const givingRecently = params.donorHasPostedDonationsInRollingWindow.get(decl.donor_id) === true;
      if (givingRecently && refAge > staleDays) {
        candidates.push({
          donor_id: decl.donor_id,
          declaration_id: decl.id,
          donation_id: null,
          reminder_type: 'stale_declaration_after_giving',
          severity: refAge > staleDays + 180 ? 'urgent' : 'warning',
          message: `Declaration signature or date is older than ${staleDays} days while the donor has given recently — consider confirming it still reflects their wishes.`,
          due_date: null,
          dedupe_key: buildDedupe('stale_declaration_after_giving', { d: decl.id }),
        });
      }

      const latest = params.donorLatestPostedDonationIso.get(decl.donor_id);
      if (latest && daysSince(latest, now) > noDonationDays) {
        candidates.push({
          donor_id: decl.donor_id,
          declaration_id: decl.id,
          donation_id: null,
          reminder_type: 'declaration_inactive_giving',
          severity: 'info',
          message: `No posted donation for this donor in over ${noDonationDays} days with an active declaration on file — follow up if you expect giving to resume.`,
          due_date: null,
          dedupe_key: buildDedupe('declaration_inactive_giving', { d: decl.id }),
        });
      }
    }

    if (decl.status === 'cancelled' && !activeForDonor.get(decl.donor_id)) {
      candidates.push({
        donor_id: decl.donor_id,
        declaration_id: decl.id,
        donation_id: null,
        reminder_type: 'declaration_cancelled_followup',
        severity: 'warning',
        message:
          'Gift Aid declaration cancelled — obtain a new declaration before future gifts can be claimed under Gift Aid.',
        due_date: null,
        dedupe_key: buildDedupe('declaration_cancelled_followup', { donor: decl.donor_id }),
      });
    }
  }

  for (const donor of params.donors) {
    const pc = donor.postcode;
    const hasGiving = params.donorLatestPostedDonationIso.has(donor.id);
    if (hasGiving && (!pc || !String(pc).trim())) {
      candidates.push({
        donor_id: donor.id,
        declaration_id: null,
        donation_id: null,
        reminder_type: 'missing_donor_postcode',
        severity: 'warning',
        message:
          'Donor postcode missing — HMRC-style Gift Aid records need a full UK address including postcode.',
        due_date: null,
        dedupe_key: buildDedupe('missing_donor_postcode', { donor: donor.id }),
      });
    }
  }

  const out: GiftAidReminderCandidate[] = [];
  const seenOut = new Set<string>();
  for (const c of candidates) {
    if (seenOut.has(c.dedupe_key)) continue;
    seenOut.add(c.dedupe_key);
    out.push(c);
  }
  return out;
}

export async function syncGiftAidDeclarationReminders(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ error: string | null }> {
  const { data: settingsRow, error: settingsError } = await supabase
    .from('organisation_settings')
    .select(
      'gift_aid_reminder_stale_declaration_days, gift_aid_reminder_no_donation_days, gift_aid_require_signed_declaration_copy'
    )
    .eq('organisation_id', workspaceId)
    .maybeSingle();

  if (settingsError) {
    return { error: settingsError.message };
  }

  const settings: GiftAidReminderSettingsRow = {
    gift_aid_reminder_stale_declaration_days: Number(
      settingsRow?.gift_aid_reminder_stale_declaration_days ?? 365
    ),
    gift_aid_reminder_no_donation_days: Number(
      settingsRow?.gift_aid_reminder_no_donation_days ?? 540
    ),
    gift_aid_require_signed_declaration_copy: Boolean(
      settingsRow?.gift_aid_require_signed_declaration_copy
    ),
  };

  const { data: decls, error: declError } = await supabase
    .from('gift_aid_declarations')
    .select(
      'id, donor_id, status, start_date, end_date, declaration_date, signed_date, attachment_url, generated_pdf_storage_path'
    )
    .eq('organisation_id', workspaceId);

  if (declError) {
    return { error: declError.message };
  }

  const donorIdsFromDecl = Array.from(
    new Set((decls ?? []).map((d) => d.donor_id).filter(Boolean) as string[])
  );

  const { data: donationsAgg, error: donError } = await supabase
    .from('donations')
    .select('donor_id, donation_date')
    .eq('organisation_id', workspaceId)
    .eq('status', 'posted')
    .not('donor_id', 'is', null);

  if (donError) {
    return { error: donError.message };
  }

  const latestByDonor = new Map<string, string>();
  const rollingWindowCutoff = new Date();
  rollingWindowCutoff.setMonth(rollingWindowCutoff.getMonth() - 18);
  const rollingIso = rollingWindowCutoff.toISOString().slice(0, 10);
  const hasRecent = new Map<string, boolean>();

  for (const row of donationsAgg ?? []) {
    const did = row.donor_id as string;
    const dd = row.donation_date as string;
    const prev = latestByDonor.get(did);
    if (!prev || dd > prev) {
      latestByDonor.set(did, dd);
    }
    if (dd >= rollingIso) {
      hasRecent.set(did, true);
    }
  }

  const allDonorIds = Array.from(
    new Set([...donorIdsFromDecl, ...latestByDonor.keys()])
  );

  let donorsList: Array<{ id: string; postcode: string | null }> = [];
  if (allDonorIds.length > 0) {
    const { data: donorRows, error: donorsError } = await supabase
      .from('donors')
      .select('id, postcode')
      .eq('organisation_id', workspaceId)
      .in('id', allDonorIds);

    if (donorsError) {
      return { error: donorsError.message };
    }
    donorsList = (donorRows ?? []).map((d) => ({
      id: d.id as string,
      postcode: (d.postcode as string | null) ?? null,
    }));
  }

  const candidates = evaluateGiftAidReminderCandidates({
    settings,
    declarations: (decls ?? []).map((d) => ({
      id: d.id as string,
      donor_id: d.donor_id as string,
      status: String(d.status),
      start_date: d.start_date as string,
      end_date: (d.end_date as string | null) ?? null,
      declaration_date: (d.declaration_date as string | null) ?? null,
      signed_date: (d.signed_date as string | null) ?? null,
      attachment_url: (d.attachment_url as string | null) ?? null,
      generated_pdf_storage_path: (d.generated_pdf_storage_path as string | null) ?? null,
    })),
    donors: donorsList,
    donorLatestPostedDonationIso: latestByDonor,
    donorHasPostedDonationsInRollingWindow: hasRecent,
  });

  const desiredKeys = new Set(candidates.map((c) => c.dedupe_key));

  const { data: openRows, error: openError } = await supabase
    .from('gift_aid_reminders')
    .select('id, dedupe_key, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open');

  if (openError) {
    return { error: openError.message };
  }

  const { data: dismissedKeysData, error: dismissedError } = await supabase
    .from('gift_aid_reminders')
    .select('dedupe_key')
    .eq('workspace_id', workspaceId)
    .eq('status', 'dismissed');

  if (dismissedError) {
    return { error: dismissedError.message };
  }

  const dismissedKeySet = new Set(
    (dismissedKeysData ?? []).map((r) => r.dedupe_key as string)
  );

  for (const c of candidates) {
    if (dismissedKeySet.has(c.dedupe_key)) {
      continue;
    }

    const { error: upsertError } = await supabase.from('gift_aid_reminders').upsert(
      {
        workspace_id: workspaceId,
        donor_id: c.donor_id,
        declaration_id: c.declaration_id,
        donation_id: c.donation_id,
        reminder_type: c.reminder_type,
        severity: c.severity,
        message: c.message,
        status: 'open',
        due_date: c.due_date,
        dedupe_key: c.dedupe_key,
        resolved_at: null,
        dismissed_at: null,
        dismissed_by: null,
      },
      { onConflict: 'workspace_id,dedupe_key' }
    );

    if (upsertError) {
      return { error: upsertError.message };
    }
  }

  const toResolve = (openRows ?? []).filter((r) => !desiredKeys.has(r.dedupe_key as string));
  if (toResolve.length > 0) {
    const { error: resolveError } = await supabase
      .from('gift_aid_reminders')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .in(
        'id',
        toResolve.map((r) => r.id as string)
      );

    if (resolveError) {
      return { error: resolveError.message };
    }
  }

  return { error: null };
}
