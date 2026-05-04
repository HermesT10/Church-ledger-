# Gift Aid declaration reminders and cancellation workflow

## Overview

The feature adds **persisted workspace reminders** (`gift_aid_reminders`) for operational Gift Aid hygiene, plus a **structured cancellation** flow for declarations with an effective **end date**, **reason**, optional **evidence/notes**, and **`cancelled_by`**.

## Database (migration `00088_gift_aid_declaration_reminders.sql`)

- **`gift_aid_reminders`**: `workspace_id`, optional `donor_id` / `declaration_id` / `donation_id`, `reminder_type`, `severity` (`info` | `warning` | `urgent`), `message`, `status` (`open` | `dismissed` | `resolved`), optional `due_date`, stable **`dedupe_key`**, dismissal metadata, timestamps. Unique `(workspace_id, dedupe_key)` for upserts.

- **`gift_aid_declarations`**: `cancelled_by` → `profiles`, `cancellation_evidence_notes` (separate from `cancellation_reason`).

- **`organisation_settings`**: `gift_aid_reminder_stale_declaration_days` (default 365), `gift_aid_reminder_no_donation_days` (default 540), `gift_aid_require_signed_declaration_copy` (default false).

## Behaviour

### Cancellation (`cancelDeclaration`)

- Accepts **`reason`**, **`cancellationDate` (YYYY-MM-DD)**, **`evidenceNotes`** (backward compatible when the second argument is still a plain string reason).
- Sets `status`, `end_date`, `cancellation_reason`, `cancellation_evidence_notes`, `cancelled_by`, **`updated_by`**, triggers existing `cancelled_at` sync.
- **Audit**: `gift_aid_declaration_cancelled` metadata includes date, notes, cancelling user id.
- **Validations**: `syncDonorGiftAidValidations` re-runs for **unclaimed** donations (`gift_aid_claim_id` null) so eligibility reflects the new boundary; **claimed** rows unchanged by design.

### Coverage rule (`declarationCoversDonation`)

- **Cancelled** declarations: donation is covered iff `startDate ≤ donationDate ≤ endDate` — **requires** `end_date` after cancellation **or** inferred date from the UI (defaults to today if omitted historically).
- **Active/expired**: unchanged apart from comparing **calendar dates** consistently for start/end boundaries.

### Reminder evaluation (`declaration-reminders.ts`)

- **Missing signed copy** when `gift_aid_require_signed_declaration_copy` is true and an active declaration lacks attachment / generated PDF.
- **Stale declaration after giving** when the donor gave in the rolling **18‑month** window but the declaration’s signed/declaration/start date exceeds the stale-days threshold.
- **Inactivity ping** when an active declaration exists and the donor’s latest **posted** donation is older than the no‑donation threshold.
- **Cancellation follow‑up** when a declaration is **cancelled** and there is **no** other active declaration for the donor (`dedupe` per donor).
- **Missing donor postcode** when the donor has posted gifts but postcode is blank.

Sync **opens** matched rows **except** dedupe keys that were **Dismissed** (dismissals are not reopened automatically).

## Application wiring

- **Control centre**: `getGiftAidControlCentreData` runs `syncGiftAidDeclarationReminders`, then loads **open** reminders and surfaces **metrics**, **alert seeds**, **`reminders`** for the Overview list, plus **`reminder_settings`** for the Settings tab.
- **Actions**: `refreshGiftAidDeclarationReminders`, `dismissGiftAidReminder`, `updateGiftAidReminderSettings`.
- **UI**: Overview cards; Settings thresholds + manual refresh; donor profile banner; declarations table statuses; declarations **Cancel** dialog for date/evidence.

## Testing

- `tests/giftAidHelpers.test.ts` — cancelled declaration date boundaries.
- `tests/declarationReminders.test.ts` — evaluation rules for signed-copy and cancelled follow-up cases.
