# Password Reset Flow Audit

## Current Auth Files Found

- `src/app/login/page.tsx` renders the login UI, supports email/password login, Google OAuth, login messages through query params, and links to `/forgot-password`.
- `src/app/login/actions.ts` handles email/password login with the server Supabase client.
- `src/app/signup/page.tsx` renders the signup UI.
- `src/app/signup/actions.ts` handles signup with `supabase.auth.signUp`.
- `src/app/forgot-password/page.tsx` already exists and calls `supabase.auth.resetPasswordForEmail`.
- `src/app/reset-password/page.tsx` already exists and calls `supabase.auth.updateUser`.
- `src/app/auth/callback/route.ts` exchanges OAuth/auth callback codes with `supabase.auth.exchangeCodeForSession`.
- `src/proxy.ts` lists `/forgot-password`, `/reset-password`, and `/auth/callback` as public paths.

## Supabase Client Approach

- Browser client: `src/lib/supabase/client.ts` uses `createBrowserClient` from `@supabase/ssr` and the public Supabase URL/anon key.
- Server client: `src/lib/supabase/server.ts` uses `createServerClient` from `@supabase/ssr` and Next cookies.
- Admin client: `src/lib/supabase/admin.ts` is for service-role server operations and must not be used for password reset pages.
- Auth callback: `src/app/auth/callback/route.ts` exchanges a `code` param and redirects to a safe relative `next` path or `/dashboard`.

## Environment Variables

- `.env.example` includes `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
- `src/lib/env.ts` validates `NEXT_PUBLIC_SITE_URL` as an optional public URL.
- `src/lib/env.server.ts` exposes `getSiteUrl()`, falling back from `NEXT_PUBLIC_SITE_URL` to Vercel URL values, then `http://localhost:3000`.
- Client reset email redirects should use `NEXT_PUBLIC_SITE_URL` where configured, with `window.location.origin` as the client-only fallback.

## Current UI And Notification Patterns

- Auth pages use `Logo`, shadcn `Button`, `Input`, `Label`, `Separator`, and lucide icons.
- Login displays query-string error/message banners.
- Forgot/reset pages use inline success/error panels, matching the existing auth page pattern.
- The app also uses `sonner` in authenticated client areas, but the public auth pages currently rely on inline feedback.

## Password Validation Found

- Signup currently requires at least 6 characters in `src/app/signup/actions.ts`.
- Login input hints at at least 6 characters.
- The existing reset page already requires at least 8 characters.
- This implementation keeps the reset flow at 8+ characters as requested. A broader password policy alignment can be handled separately.

## Existing Reset Flow Gaps

- `src/app/forgot-password/page.tsx` uses `window.location.origin` directly instead of preferring `NEXT_PUBLIC_SITE_URL`.
- The forgot page can show raw Supabase errors via `error.message`.
- Forgot/reset page copy does not exactly match the requested product copy.
- Invalid/expired recovery link copy differs from the required message.
- The reset page can show raw Supabase update errors.
- No dedicated password reset tests were found.
- Supabase dashboard redirect URLs still need to be configured outside the codebase for local, preview, and production domains.

## Required Routes

- `/forgot-password`: request reset email with `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
- `/reset-password`: establish the recovery session and update the password with `supabase.auth.updateUser({ password })`.

## Implementation Plan

1. Harden `/forgot-password` with email validation, deterministic redirect URL construction, required copy, generic success messaging, and safe error messages.
2. Harden `/reset-password` while preserving support for `code`, `token_hash&type=recovery`, `PASSWORD_RECOVERY`, and session lookup.
3. Keep all reset operations on the public Supabase anon/browser client. Do not use the service role key.
4. Add structural tests for page copy, validation, Supabase calls, redirect URL behavior, invalid-link handling, and success redirect.
5. Add implementation documentation with Supabase dashboard redirect URL setup and troubleshooting notes.

## Risks And Controls

- Account enumeration: use a generic success message and do not reveal whether an email exists.
- Open redirects: construct the reset redirect internally from configured site URL or current origin, never from user input.
- Expired recovery links: show a safe, clear message and link users back to `/forgot-password`.
- Preview/prod breakage: document all required Supabase allowed redirect URLs.
- Sensitive logging: do not log passwords, tokens, or reset links.
