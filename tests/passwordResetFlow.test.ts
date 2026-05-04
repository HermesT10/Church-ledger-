import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const forgotPage = readFileSync(
  new URL('../src/app/forgot-password/page.tsx', import.meta.url),
  'utf8',
);
const resetPage = readFileSync(
  new URL('../src/app/reset-password/page.tsx', import.meta.url),
  'utf8',
);
const auditDoc = readFileSync(
  new URL('../docs/audits/password-reset-flow-audit.md', import.meta.url),
  'utf8',
);

describe('password reset flow', () => {
  it('documents the current auth implementation before implementation', () => {
    expect(auditDoc).toContain('Current Auth Files Found');
    expect(auditDoc).toContain('src/app/login/page.tsx');
    expect(auditDoc).toContain('src/app/signup/page.tsx');
    expect(auditDoc).toContain('src/app/auth/callback/route.ts');
    expect(auditDoc).toContain('Supabase Client Approach');
    expect(auditDoc).toContain('NEXT_PUBLIC_SITE_URL');
    expect(auditDoc).toContain('Risks And Controls');
  });

  it('renders the forgot password page with required copy and login link', () => {
    expect(forgotPage).toContain('Reset your password');
    expect(forgotPage).toContain('Enter your email and we’ll send you a secure reset link.');
    expect(forgotPage).toContain('Back to login');
    expect(forgotPage).toContain('href="/login"');
  });

  it('validates email and requests a reset with a controlled redirect URL', () => {
    expect(forgotPage).toContain('isValidEmail');
    expect(forgotPage).toContain('Enter a valid email address.');
    expect(forgotPage).toContain('process.env.NEXT_PUBLIC_SITE_URL');
    expect(forgotPage).toContain('window.location.origin');
    expect(forgotPage).toContain('return `${origin}/reset-password`;');
    expect(forgotPage).toContain('resetPasswordForEmail(trimmedEmail');
    expect(forgotPage).toContain('redirectTo: getResetRedirectUrl()');
  });

  it('uses generic forgot-password success and safe error messages', () => {
    expect(forgotPage).toContain('If an account exists for this email, we’ve sent a password reset link.');
    expect(forgotPage).not.toContain('setError(error.message)');
    expect(forgotPage).toContain('We could not send a reset link right now. Please wait a moment and try again.');
  });

  it('renders the reset password page with required copy and recovery handling', () => {
    expect(resetPage).toContain('Create a new password');
    expect(resetPage).toContain('Choose a secure password for your account.');
    expect(resetPage).toContain('exchangeCodeForSession(code)');
    expect(resetPage).toContain("verifyOtp({");
    expect(resetPage).toContain("type: 'recovery'");
    expect(resetPage).toContain("event === 'PASSWORD_RECOVERY'");
    expect(resetPage).toContain('getSession()');
  });

  it('validates password requirements and mismatch before update', () => {
    expect(resetPage).toContain('Password is required.');
    expect(resetPage).toContain('Confirm your new password.');
    expect(resetPage).toContain('Password must be at least 8 characters.');
    expect(resetPage).toContain('Passwords do not match.');
    expect(resetPage).toContain('Use at least 8 characters.');
  });

  it('updates the password, handles expired links safely, and redirects after success', () => {
    expect(resetPage).toContain('updateUser({');
    expect(resetPage).toContain('password,');
    expect(resetPage).toContain('This password reset link is invalid or has expired. Please request a new one.');
    expect(resetPage).not.toContain('setError(error.message)');
    expect(resetPage).toContain('signOut()');
    expect(resetPage).toContain('router.replace(');
    expect(resetPage).toContain('/login?message=');
  });
});
