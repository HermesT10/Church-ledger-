import { getProfile } from './actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { ProfileClient } from './profile-client';

export default async function ProfilePage() {
  const { data, error } = await getProfile();

  return (
    <PageShell>
      <PageHeader
        title="Your Profile"
        subtitle="Manage your personal details and preferences"
      />

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      <ProfileClient profile={data} />
    </PageShell>
  );
}
