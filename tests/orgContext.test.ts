import { describe, expect, it } from 'vitest';
import { resolveActiveMembership, type UserOrganisationMembership } from '@/lib/org';

const memberships: UserOrganisationMembership[] = [
  {
    orgId: 'org-1',
    orgName: 'Alpha Church',
    role: 'admin',
    joinedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    logoUrl: null,
  },
  {
    orgId: 'org-2',
    orgName: 'Beta Church',
    role: 'viewer',
    joinedAt: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    logoUrl: null,
  },
];

describe('resolveActiveMembership', () => {
  it('uses the preferred organisation when available', () => {
    expect(resolveActiveMembership(memberships, 'org-2')?.orgName).toBe('Beta Church');
  });

  it('falls back to the first active membership when the preference is missing', () => {
    expect(resolveActiveMembership(memberships, 'missing')?.orgId).toBe('org-1');
  });

  it('returns null when the user has no active memberships', () => {
    expect(resolveActiveMembership([], 'org-1')).toBeNull();
  });
});
