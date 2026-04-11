'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function verify() {
      try {
        const { token } = await params;
        const res = await fetch(`/api/v1/auth/verify-email/${token}`, { method: 'POST' });
        if (res.ok) {
          setStatus('success');
          setMessage('Your email has been verified successfully!');
        } else {
          const body = await res.json();
          setStatus('error');
          setMessage(body.message || 'Verification failed. The link may have expired.');
        }
      } catch {
        setStatus('error');
        setMessage('Network error. Please try again.');
      }
    }
    verify();
  }, [params]);

  return (
    <Card className="text-center">
      <CardContent className="py-8">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-500" />
            <p className="mt-4 text-sm text-secondary-500">Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-50">
              <CheckCircle className="h-7 w-7 text-success-600" />
            </div>
            <h2 className="text-lg font-semibold text-secondary-900">Email verified!</h2>
            <p className="mt-2 text-sm text-secondary-500">{message}</p>
            <Link href="/login" className="mt-6 inline-block">
              <Button>Continue to sign in</Button>
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-50">
              <XCircle className="h-7 w-7 text-danger-600" />
            </div>
            <h2 className="text-lg font-semibold text-secondary-900">Verification failed</h2>
            <p className="mt-2 text-sm text-secondary-500">{message}</p>
            <Link href="/login" className="mt-6 inline-block">
              <Button variant="secondary">Back to sign in</Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
