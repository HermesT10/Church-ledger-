# Gift Aid Self-Service Declarations

## Purpose
Admins can generate secure declaration links for donors. Donors complete and e-sign a Gift Aid declaration without logging into the admin app. The submission creates or updates an active declaration, stores evidence, generates a PDF, and rechecks pending donations for Gift Aid eligibility.

## Data Model
- `gift_aid_declaration_links` stores link lifecycle state and only the SHA-256 token hash.
- `gift_aid_declarations` stores self-service evidence including typed signature, text version, submitted user agent, optional IP address, source link, and generated PDF path.
- `gift_aid_declaration_documents` stores the generated PDF metadata in the private `gift-aid` storage bucket.

## Token Security
- The raw token is generated with high-entropy random bytes and is shown only at creation/regeneration time.
- The database stores `token_hash`, not the raw token.
- Links can be `active`, `used`, `expired`, or `revoked`.
- Public submission resolves workspace, donor, and declaration from the token server-side. The client never submits or controls `workspace_id`.
- Used, revoked, and expired tokens are blocked.

## Public Flow
The public route is `/gift-aid/declaration/[token]`.

The donor sees limited prefilled data, the charity name, HMRC declaration wording, notification notes, scope options, taxpayer confirmation, and an e-signature field. On submission, the server validates the token again before writing anything.

## Evidence And PDF
On successful submission:
- declaration text version is stored
- typed signature is stored
- taxpayer confirmation is stored
- submission timestamp is captured
- user agent and optional IP are captured
- a completed declaration PDF is generated and uploaded to private storage
- the declaration document row is inserted for admin download

## Donation Recheck
After the declaration is activated, the donor’s posted, unclaimed donations are revalidated. Donations previously blocked for `missing_declaration` can move to `eligible` when the new declaration covers the donation date.

## Email
No email provider is currently configured in the app. The admin action returns a clear fallback telling the user to copy and send the link manually. The action boundary is in place for a future email integration.
