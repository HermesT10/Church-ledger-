'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { acceptInvite } from '@/lib/invites/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState<string | undefined>();

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No invite token provided.');
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await acceptInvite(token);

      if (cancelled) return;

      if (result.error) {
        setStatus('error');
        setMessage(result.error);
      } else {
        setStatus('success');
        setOrgName(result.orgName);
        setMessage(
          result.orgName
            ? `You have joined ${result.orgName}. Redirecting…`
            : 'Invite accepted! Redirecting…',
        );
        setTimeout(() => {
          if (!cancelled) router.push('/dashboard');
        }, 2000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {status === 'loading' && 'Accepting Invite…'}
            {status === 'success' && 'Welcome!'}
            {status === 'error' && 'Invite Error'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we process your invite.'}
            {status === 'success' && (orgName ? `You've been added to ${orgName}.` : "You've been added to the organisation.")}
            {status === 'error' && 'We could not process this invite.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'loading' && (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          )}
          {status === 'success' && (
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-muted-foreground text-center">{message}</p>
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Go to Dashboard
              </Button>
            </>
          )}
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
