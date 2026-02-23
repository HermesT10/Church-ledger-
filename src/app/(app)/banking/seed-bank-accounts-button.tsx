'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { seedBankAccounts } from '@/lib/banking/bankAccounts';
import { Button } from '@/components/ui/button';

export function SeedBankAccountsButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSeed() {
    setLoading(true);
    const result = await seedBankAccounts(orgId);
    setLoading(false);

    if (result.success) {
      toast.success('Demo bank accounts seeded successfully.');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to seed bank accounts.');
    }
  }

  return (
    <Button variant="outline" onClick={handleSeed} disabled={loading}>
      {loading ? 'Seeding…' : 'Seed demo bank accounts'}
    </Button>
  );
}
