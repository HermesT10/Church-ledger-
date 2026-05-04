import { redirect } from 'next/navigation';
import { acceptInvite } from '@/lib/invites/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { token } = await params;
  const { code } = await searchParams;
  const result = await acceptInvite(token, code);

  if (!result.error) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="text-center">
          <CardTitle>Invite could not be accepted</CardTitle>
          <CardDescription>
            The invite link was blocked for security reasons.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{result.error}</p>
          <Button asChild variant="outline">
            <a href="/login">Sign in with another account</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
