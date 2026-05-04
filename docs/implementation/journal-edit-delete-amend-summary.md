# Journal Edit, Delete, Reversal, And Amendment Summary

## Journal Lifecycle

Journals now support the lifecycle metadata required for safe corrections:

- draft and approved journals remain pre-posting workflow states
- posted journals remain immutable in the ledger
- posted corrections happen through linked reversal and replacement journals
- void/amendment/reversal metadata is available for future reporting and UI expansion

For report compatibility, the original reversed journal remains `posted` and is linked with `reversed_by` / correction metadata. Reports already sum posted journal lines, so the original plus posted reversal naturally nets to zero inside any period that includes both dates.

## Draft Edit/Delete Rules

Draft journals can be edited and deleted only when:

- the user has journal write permissions
- the journal belongs to the active workspace
- the journal status is still `draft`
- the current and new journal dates are not in locked periods
- delete dependency preview reports no reconciliation/source links

Draft edits and deletes write audit events.

## Posted Reversal Rules

Posted journals cannot be directly edited or deleted. The Reversal action:

- requires a reversal date
- requires a reason
- blocks reversal into a locked period
- creates an equal-and-opposite journal
- posts the reversal journal
- links the original and reversal
- invalidates report/dashboard caches
- writes audit logs

## Amendment Workflow

The Amend action:

1. Requires a reversal date and reason.
2. Creates and posts a reversal journal.
3. Creates a corrected replacement journal as a draft.
4. Links original, reversal, and replacement journal IDs.
5. Redirects the user to the replacement draft for editing and posting.

This preserves posted history while giving users a practical correction workflow.

## Locked Period Rules

The app blocks:

- creating journals in locked periods
- editing draft journals in locked periods
- deleting draft journals in locked periods
- posting approved journals in locked periods
- reversing into locked periods

Corrections for older locked periods should be dated in an open period.

## Reporting Impact

Reports and dashboards already consume posted `journals` and `journal_lines`, so:

- draft edits/deletes do not affect posted reports
- posted reversal journals flow into Trial Balance, Balance Sheet, SOFA, Fund Movement, Account Activity, registers, dashboard and cash views as normal posted journals
- amendment replacement drafts have no effect until posted
- `invalidateOrgReportCache` is called after post, reverse, and amend

## Audit Trail Behaviour

Audit events now cover:

- `draft_journal_created`
- `draft_journal_edited`
- `journal_delete`
- `post_journal`
- `reverse_journal`
- `journal_amended`

The detail page shows linked correction-chain IDs where present.
