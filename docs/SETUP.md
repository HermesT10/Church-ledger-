# ChurchLedger — Supabase Setup

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**, choose an organisation, set a project name, database password, and region.
3. Wait for the project to finish provisioning (~1 minute).

## 2. Get your API keys

1. In the Supabase dashboard navigate to **Settings → API**.
2. Copy the following values:

| Dashboard field | Env variable |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / public** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role / secret** key | `SUPABASE_SERVICE_ROLE_KEY` |

> **Important:** The `service_role` key bypasses Row Level Security. Never expose it to the browser.

## 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with the values from step 2.

## 4. Verify connectivity

Start the dev server and hit the health endpoint:

```bash
npm run dev
curl http://localhost:3000/api/health
```

You should see:

```json
{ "status": "ok", "timestamp": "2026-02-12T..." }
```

If you see `{ "status": "error", ... }`, double-check your env values and that the Supabase project is active.

## 5. Bank CSV Import (Phase 3)

Navigate to **Banking → (select a bank account) → Import CSV** to upload transaction files.

### 5.1 Column requirements

| Column | Required | Notes |
|---|---|---|
| `date` | Yes | Transaction date |
| `amount` | Yes | Transaction amount (positive = inflow, negative = outflow) |
| `description` | No | Payee or transaction narrative |
| `reference` | No | Cheque number, payment reference, etc. |
| `balance` | No | Running balance after the transaction |

Header names are matched **case-insensitively** during auto-detection. If the importer cannot match a header automatically, you can map each column manually in the mapping step before importing.

### 5.2 Example CSV

```csv
Date,Description,Amount,Reference,Balance
2026-01-05,Sunday Offering,£1250.00,SO-001,£4250.00
2026-01-08,Electricity Bill,-£87.50,DD-UTIL,£4162.50
15/01/2026,Hall Hire Income,£350.00,INV-042,£4512.50
22/01/2026,Insurance Premium,(£125.00),DD-INS,£4387.50
2026-01-31,Youth Group Fundraiser,£480.75,FUN-007,£4868.25
```

### 5.3 Supported amount formats

The importer accepts a wide range of amount formats:

| Format | Example | Parsed as |
|---|---|---|
| Plain decimal | `12.34` | £12.34 inflow |
| Negative with minus | `-12.34` | £12.34 outflow |
| Accounting parentheses | `(12.34)` | £12.34 outflow |
| Currency symbol + commas | `£1,234.56` | £1,234.56 inflow |
| Currency symbol with spaces | `£ 1,234.56` | £1,234.56 inflow |
| Zero | `0` or `0.00` | £0.00 |

Internally all amounts are stored as **integer pence** (e.g. `£12.34` becomes `1234`).

### 5.4 Supported date formats

| Format | Example |
|---|---|
| ISO 8601 | `2026-01-15` |
| UK with slashes | `15/01/2026` |
| UK with dashes | `15-01-2026` |
| UK with dots | `15.01.2026` |
| Fallback | Anything JavaScript `new Date()` can parse |

Dates are stored in ISO format (`YYYY-MM-DD`) regardless of the input format.

### 5.5 Duplicates and fingerprint logic

Every imported row is assigned a **fingerprint** — a SHA-256 hash of four fields:

```
SHA-256( txn_date | amount_pence | normalized(reference) | normalized(description) )
```

- `normalized()` means: trimmed, lowercased, and multiple spaces collapsed to one.
- The database enforces a **unique constraint** on `(bank_account_id, fingerprint)`.

When you re-import the same CSV (or one that overlaps), duplicate rows are **silently skipped**. The import summary will report them as "skipped duplicates".

> **Note:** Two genuinely different transactions with the same date, amount, reference, and description will produce the same fingerprint and only the first will be stored. If this happens, add a distinguishing detail to the reference or description in your CSV before re-importing.

### 5.6 Troubleshooting

| Error message | Cause | Fix |
|---|---|---|
| "Missing date value" | The `date` column is not mapped or the cell is blank | Check the mapping step — ensure a column is assigned to **Date**. Remove blank rows from the CSV. |
| "Missing amount value" | The `amount` column is not mapped or the cell is blank | Check the mapping step — ensure a column is assigned to **Amount**. |
| "Cannot parse date" | The date string is in an unrecognised format | Convert dates to `YYYY-MM-DD` or `DD/MM/YYYY` before importing. |
| 0 rows inserted, N skipped | The file has already been imported (all fingerprints match) | This is expected on re-import. No action needed. |
| "Batch insert error" | Database-level error during insert (e.g. RLS violation) | Ensure you are logged in as a **Treasurer** or **Admin**. Check that the bank account belongs to your organisation. |
| Wrong columns mapped | Auto-detection picked the wrong CSV headers | Use the manual mapping dropdowns in step 2 of the import wizard to correct assignments before clicking **Import**. |
