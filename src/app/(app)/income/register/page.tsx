import { RegisterPage } from '@/components/registers/register-page';

export default function IncomeRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    compare?: string;
    fundId?: string;
    mode?: 'actual' | 'budget' | 'variance';
    category?: string;
    month?: string;
    error?: string;
    success?: string;
  }>;
}) {
  return <RegisterPage registerType="income" searchParams={searchParams} />;
}
