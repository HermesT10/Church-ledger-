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
  const missingToken = !token;

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState<string | undefined>();

  useEffect(() => {
    if (!token) {
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

  const displayStatus = missingToken ? 'error' : status;
  const displayMessage = missingToken ? 'No invite token provided.' : message;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {displayStatus === 'loading' && 'Accepting Invite…'}
            {displayStatus === 'success' && 'Welcome!'}
            {displayStatus === 'error' && 'Invite Error'}
          </CardTitle>
          <CardDescription>
            {displayStatus === 'loading' && 'Please wait while we process your invite.'}
            {displayStatus === 'success' && (orgName ? `You've been added to ${orgName}.` : "You've been added to the organisation.")}
            {displayStatus === 'error' && 'We could not process this invite.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {displayStatus === 'loading' && (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          )}
          {displayStatus === 'success' && (
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          )}
          {displayStatus === 'error' && (
            <>
              <XCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-muted-foreground text-center">{displayMessage}</p>
              <Button onClick={() => router.push('/dashboard')} variant="outline">
                Go to Dashboard
              </Button>
            </>
          )}
          {displayStatus === 'success' && (
            <p className="text-sm text-muted-foreground">{displayMessage}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
