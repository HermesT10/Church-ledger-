# ChurchLedger

ChurchLedger is a multi-organisation church finance and accounting workspace built with Next.js and Supabase.

## Local Setup

1. Copy the env template:

```bash
cp .env.example .env.local
```

2. Fill in the required Supabase values in `.env.local`.

3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm run dev
```

5. Verify readiness:

```bash
curl http://localhost:3000/api/health
```

## Common Scripts

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e:smoke
npm run build
```

## Operational Docs

- `docs/audits/production-ops-audit.md`
- `docs/architecture/environment-strategy.md`
- `docs/architecture/database-lifecycle.md`
- `docs/runbooks/backup-and-recovery.md`
- `docs/runbooks/release-checklist.md`
- `docs/runbooks/deploy-runbook.md`

## Learn More

Project-specific setup guidance lives in:

- `docs/SETUP.md`
- `docs/permissions.md`
- `docs/DEMO_MODE.md`

For framework details, see:

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase documentation](https://supabase.com/docs)
