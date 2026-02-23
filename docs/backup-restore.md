# Backup & Restore Guide

This document describes how to back up and restore the ChurchLedger database, covering both Supabase-hosted and self-hosted deployments.

---

## 1. Supabase Hosted (Recommended)

### Automatic Backups

- **Pro plan and above**: Supabase takes **daily automatic backups** retained for 7 days.
- **Enterprise plan**: Point-in-Time Recovery (PITR) is available, allowing restoration to any second within the retention window.
- Backups are stored securely by Supabase and are not directly downloadable as files.

### Viewing Backup Status

1. Go to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project.
3. Navigate to **Settings > Database > Backups**.
4. View available restore points and their timestamps.

### Restoring from a Backup

1. In the Supabase Dashboard, navigate to **Settings > Database > Backups**.
2. Select the backup point you want to restore to.
3. Click **Restore**. This will replace the current database with the backup.
4. **Warning**: Restoring overwrites all data created since the backup point.

### Manual Export (pg_dump via Supabase)

For an on-demand backup or migration:

```bash
# Replace <project-ref> with your Supabase project reference
# Replace <db-password> with your database password
pg_dump \
  --host db.<project-ref>.supabase.co \
  --port 5432 \
  --username postgres \
  --format custom \
  --file backup_$(date +%Y%m%d_%H%M%S).dump \
  postgres
```

You will be prompted for the database password (found in **Settings > Database > Connection string**).

---

## 2. Self-Hosted Deployment

### Manual Backup with pg_dump

```bash
# Full database backup (compressed custom format)
pg_dump \
  --host localhost \
  --port 5432 \
  --username postgres \
  --format custom \
  --file backup_$(date +%Y%m%d_%H%M%S).dump \
  churchledger

# SQL-format backup (human-readable, larger file)
pg_dump \
  --host localhost \
  --port 5432 \
  --username postgres \
  --format plain \
  --file backup_$(date +%Y%m%d_%H%M%S).sql \
  churchledger
```

### Recommended Backup Schedule

| Frequency | What                              | Retention |
| --------- | --------------------------------- | --------- |
| Daily     | Full pg_dump (custom format)      | 30 days   |
| Weekly    | Full pg_dump uploaded to S3/GCS   | 90 days   |
| Monthly   | Full pg_dump archived long-term   | 1 year    |

### Cron Example (Daily at 2 AM)

```cron
0 2 * * * /usr/bin/pg_dump --host localhost --port 5432 --username postgres --format custom --file /backups/churchledger_$(date +\%Y\%m\%d).dump churchledger 2>> /var/log/backup.log
```

---

## 3. Restoring a Backup

### From Custom Format (.dump)

```bash
# Restore to a specific database (e.g., staging)
pg_restore \
  --host localhost \
  --port 5432 \
  --username postgres \
  --dbname churchledger_staging \
  --clean \
  --if-exists \
  backup_20260101_020000.dump
```

### From SQL Format (.sql)

```bash
psql \
  --host localhost \
  --port 5432 \
  --username postgres \
  --dbname churchledger_staging \
  < backup_20260101_020000.sql
```

### Restoring Production to Staging

1. Take a fresh backup of production (see above).
2. Drop and recreate the staging database:
   ```bash
   dropdb --host localhost --username postgres churchledger_staging
   createdb --host localhost --username postgres churchledger_staging
   ```
3. Restore the production backup into staging:
   ```bash
   pg_restore --host localhost --username postgres --dbname churchledger_staging production_backup.dump
   ```
4. **Important**: After restoring, update any environment-specific settings (API keys, URLs, etc.) in the staging environment.

---

## 4. Access Control

| Role             | Can Trigger Backup | Can Restore | Can View Backups |
| ---------------- | ------------------ | ----------- | ---------------- |
| Database Admin   | Yes                | Yes         | Yes              |
| Supabase Owner   | Yes (dashboard)    | Yes         | Yes              |
| App Admin        | No (view guide)    | No          | No               |
| Treasurer        | No                 | No          | No               |
| Trustee/Auditor  | No                 | No          | No               |

Backup and restore operations require direct database access or Supabase dashboard access. Application-level users cannot trigger or access backups.

---

## 5. Disaster Recovery Checklist

1. Identify the incident and determine the last known good state.
2. Notify stakeholders that a restore is in progress.
3. Take a backup of the current (potentially corrupted) state for forensic analysis.
4. Restore from the most recent clean backup.
5. Verify data integrity: run key reports, check recent transactions.
6. Document the incident, cause, and resolution.
7. Review backup schedule and adjust if needed.

---

## 6. Testing Backups

Backups should be tested regularly (at least quarterly):

1. Restore the latest backup to a staging/test environment.
2. Verify the application starts and data loads correctly.
3. Run a few key reports to confirm data integrity.
4. Document the test date and result.

Untested backups are not backups.
