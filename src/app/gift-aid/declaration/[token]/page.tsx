import { getSelfServiceGiftAidDeclarationPreview } from '@/lib/giftaid/actions';
import { GiftAidDeclarationPublicClient } from './public-client';

export default async function PublicGiftAidDeclarationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { data, error } = await getSelfServiceGiftAidDeclarationPreview(token);

  return (
    <GiftAidDeclarationPublicClient
      token={token}
      preview={data}
      error={error}
    />
  );
}
