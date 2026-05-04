import { RegisterPage } from '@/components/registers/register-page';

export default function ExpenseRegisterPage({
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
  return <RegisterPage registerType="expense" searchParams={searchParams} />;
}
