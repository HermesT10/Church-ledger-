# Password Reset Flow Summary

## Routes Updated

- `/forgot-password`: users enter an email address and request a Supabase password reset email.
- `/reset-password`: users land from the Supabase recovery email, establish the recovery session, and set a new password.

## Supabase Functions Used

- `supabase.auth.resetPasswordForEmail(email, { redirectTo })` requests the reset email.
- `supabase.auth.exchangeCodeForSession(code)` handles PKCE recovery links with a `code` query param.
- `supabase.auth.verifyOtp({ type: 'recovery', token_hash })` supports recovery links that include `token_hash&type=recovery`.
- `supabase.auth.onAuthStateChange()` listens for the `PASSWORD_RECOVERY` event.
- `supabase.auth.getSession()` confirms that a recovery session is available before showing the reset form.
- `supabase.auth.updateUser({ password })` updates the authenticated recovery user password.
- `supabase.auth.signOut()` signs the user out after password update so they can log in fresh.

## Redirect URL Setup

The forgot password page builds a controlled redirect URL ending in `/reset-password`:

1. Prefer `NEXT_PUBLIC_SITE_URL`.
2. Fall back to `window.location.origin` on the client.
3. Append `/reset-password`.

Examples:

- Local: `http://localhost:3000/reset-password`
- Production: `https://yourdomain.com/reset-password`
- Preview: `https://your-preview-domain/reset-password`

## Supabase Dashboard Setup

In Supabase dashboard:

1. Go to Authentication -> URL Configuration.
2. Add allowed redirect URLs:
   - `http://localhost:3000/reset-password`
   - `https://your-production-domain/reset-password`
   - preview domains ending in `/reset-password` if needed
3. Check the password reset email template if customising reset email copy.
4. Ensure the email provider and auth email rate limits are configured for the environment.

## Security Notes

- The forgot password page shows a generic success message and does not reveal whether an email exists.
- The redirect URL is controlled by environment/current origin and is not user-supplied.
- Passwords, recovery tokens, and reset links are not logged or stored manually.
- The public Supabase browser client is used; the service-role key is not used in client code.
- Invalid or expired links show: `This password reset link is invalid or has expired. Please request a new one.`

## Testing Checklist

- Request a reset locally from `/forgot-password`.
- Confirm the success message does not reveal whether the account exists.
- Click the Supabase email link and confirm `/reset-password` receives the recovery session.
- Try an expired or reused link and confirm the invalid-link state appears.
- Submit weak and mismatched passwords and confirm validation messages.
- Submit a valid 8+ character password and confirm redirect to `/login`.
- Repeat on preview and production after adding redirect URLs to Supabase.

## Troubleshooting

- If the reset page says the link is invalid immediately, confirm the exact `/reset-password` URL is allowlisted in Supabase.
- If local links redirect to production, check `NEXT_PUBLIC_SITE_URL` in `.env.local`.
- If preview links fail, add the preview domain URL to Supabase Auth redirect URLs.
- If emails are delayed or blocked, check Supabase email provider configuration and rate limits.
- If password update fails, request a new reset link because recovery sessions can expire quickly.
