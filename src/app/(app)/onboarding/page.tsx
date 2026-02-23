import { requireSession } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const user = await requireSession();

  const meta = user.user_metadata ?? {};

  return (
    <OnboardingForm
      defaultOrgName={meta.org_name ?? ''}
      defaultCity={meta.city ?? ''}
      defaultRole={meta.role ?? 'admin'}
    />
  );
}
