'use client';

import type { TotpSecret } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: TotpSecret; qrUrl: string } | null>(null);
  const { state } = auth;

  useEffect(() => {
    if (state.kind === 'ready') router.replace('/');
  }, [state, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const error = state.kind === 'signedOut' || state.kind === 'mfaChallenge' || state.kind === 'mfaEnroll' ? state.error : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold">LunchBox Admin</h1>
          <p className="text-sm text-muted-foreground">Staff sign-in with two-factor authentication</p>
        </div>
        {error ? <Alert tone={error.startsWith('Authenticator added') ? 'success' : 'danger'}>{error}</Alert> : null}

        {(state.kind === 'signedOut' || state.kind === 'loading') && (
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(() => auth.signIn(email, password));
            }}
          >
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                     onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
          </form>
        )}

        {state.kind === 'mfaChallenge' && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => auth.verifyTotp(code)); }}>
            <Field label="Authenticator code" htmlFor="totp">
              <Input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                     onChange={(e) => setCode(e.target.value)} autoFocus />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>Verify</Button>
          </form>
        )}

        {state.kind === 'mfaEnroll' && (
          <div className="space-y-4">
            <p className="text-sm">Two-factor authentication is required for admin access. Add LunchBox to your authenticator app.</p>
            {!enrollment ? (
              <Button className="w-full" disabled={busy} onClick={() => void run(async () => setEnrollment(await auth.startEnrollment()))}>
                Set up authenticator
              </Button>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => auth.finishEnrollment(enrollment.secret, code)); }}>
                <div className="flex justify-center rounded bg-white p-3">
                  <QRCodeSVG value={enrollment.qrUrl} size={180} aria-label="Authenticator QR code" />
                </div>
                <p className="break-all text-xs text-muted-foreground">Secret: {enrollment.secret.secretKey}</p>
                <Field label="Code from the app" htmlFor="enroll-code">
                  <Input id="enroll-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>Confirm</Button>
              </form>
            )}
            <Button variant="ghost" className="w-full" onClick={() => void auth.signOut()}>Cancel</Button>
          </div>
        )}
      </Card>
    </main>
  );
}
