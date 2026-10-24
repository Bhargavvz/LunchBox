'use client';

import type { TotpSecret } from 'firebase/auth';
import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BrandMark } from '@/components/Brand';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** The morning run, drawn: homes on the left, a dashed route, the school on the right. */
function RouteIllustration() {
  return (
    <svg viewBox="0 0 420 180" className="w-full max-w-md" aria-hidden>
      <path d="M40 132 C 110 132, 120 60, 190 70 S 300 140, 380 52" fill="none" stroke="hsl(var(--accent))" strokeWidth="2.5"
            strokeDasharray="2 9" strokeLinecap="round" opacity="0.9" />
      {[[40, 132], [118, 96], [190, 70], [262, 104]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="11" fill="hsl(var(--sidebar))" stroke="hsl(var(--sidebar-foreground) / 0.5)" strokeWidth="1.5" />
          <path d="M-5 2v-4l5-4 5 4v4z" fill="hsl(var(--sidebar-foreground) / 0.85)" />
        </g>
      ))}
      <g transform="translate(380 52)">
        <circle r="18" fill="hsl(var(--accent))" />
        <path d="M-9 6v-8l9-6 9 6v8zM-3 6v-5h6v5" fill="hsl(var(--sidebar))" />
      </g>
      <g transform="translate(226 84)">
        <circle r="7" fill="hsl(var(--sidebar-foreground))" />
        <circle r="7" fill="none" stroke="hsl(var(--sidebar-foreground))" className="origin-center animate-pulse-ring" style={{ transformBox: 'fill-box' }} />
      </g>
    </svg>
  );
}

const PROMISES = [
  { icon: ShieldCheck, text: 'Two-factor sign-in for every staff account' },
  { icon: LockKeyhole, text: 'Sessions end after 30 minutes of inactivity' },
  { icon: KeyRound, text: 'Every change you make is written to the audit log' },
];

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs font-medium text-muted-foreground" aria-label="Sign-in steps">
      {['Password', 'Authenticator'].map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 ? <span className={cn('h-px w-6', done || current ? 'bg-primary' : 'bg-border')} aria-hidden /> : null}
            <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold',
              current ? 'bg-primary text-primary-foreground' : done ? 'bg-secondary text-secondary-foreground' : 'bg-muted')}>{n}</span>
            <span className={cn(current && 'text-foreground')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CodeInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} autoFocus={autoFocus}
           onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
           placeholder="••••••"
           className="tabular h-12 text-center text-xl font-semibold tracking-[0.5em] placeholder:tracking-[0.5em]" />
  );
}

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
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
  const onPasswordKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));
  const step: 1 | 2 = state.kind === 'mfaChallenge' || state.kind === 'mfaEnroll' ? 2 : 1;

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="paper-grain relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <span className="font-display text-2xl font-semibold tracking-tight">LunchBox</span>
        </div>
        <div className="max-w-lg">
          <RouteIllustration />
          <h2 className="mt-10 font-display text-[40px] font-semibold leading-[1.1] tracking-tight">
            From home to school,<br />
            <span className="text-accent">before the lunch bell.</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-sidebar-muted">
            The operations console for every pickup, handover and payout. Children&apos;s safety comes first, so access is
            locked down by design.
          </p>
        </div>
        <ul className="space-y-2.5 text-sm text-sidebar-muted">
          {PROMISES.map((p) => (
            <li key={p.text} className="flex items-center gap-2.5">
              <p.icon className="h-4 w-4 text-accent" aria-hidden />
              {p.text}
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px] animate-pop-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-xl font-semibold">LunchBox</span>
          </div>
          <Steps step={step} />
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">
            {state.kind === 'mfaEnroll' ? 'Protect your account' : state.kind === 'mfaChallenge' ? 'One more step' : 'Welcome back'}
          </h1>
          <p className="mb-7 mt-1.5 text-sm text-muted-foreground">
            {state.kind === 'mfaEnroll'
              ? 'Two-factor authentication is required for admin access. Add LunchBox to your authenticator app.'
              : state.kind === 'mfaChallenge'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Sign in to the LunchBox operations console.'}
          </p>

          {error ? <div className="mb-5"><Alert tone={error.startsWith('Authenticator added') ? 'success' : 'danger'}>{error}</Alert></div> : null}

          {(state.kind === 'signedOut' || state.kind === 'loading') && (
            <form
              className="space-y-4"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run(() => auth.signIn(email, password));
              }}
            >
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="username" required value={email} placeholder="you@lunchbox.in"
                       className="h-11" onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password" hint={capsLock ? 'Caps Lock is on' : undefined}>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password}
                         className="h-11 pr-16" onKeyUp={onPasswordKey} onKeyDown={onPasswordKey}
                         onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword} aria-controls="password"
                          className="absolute inset-y-0 right-1.5 my-1.5 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Button type="submit" className="h-11 w-full text-[15px]" disabled={busy}>
                {busy ? 'Checking…' : 'Sign in'}
              </Button>
            </form>
          )}

          {state.kind === 'mfaChallenge' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => auth.verifyTotp(code)); }}>
              <Field label="Authenticator code" htmlFor="totp">
                <CodeInput id="totp" value={code} onChange={setCode} autoFocus />
              </Field>
              <Button type="submit" className="h-11 w-full" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => void auth.signOut()}>Use a different account</Button>
            </form>
          )}

          {state.kind === 'mfaEnroll' && (
            <div className="space-y-4">
              {!enrollment ? (
                <>
                  <div className="flex gap-3 rounded-xl border bg-card p-4 shadow-warm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                      <Smartphone className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app. It takes about a minute.
                    </p>
                  </div>
                  <Button className="h-11 w-full" disabled={busy} onClick={() => void run(async () => setEnrollment(await auth.startEnrollment()))}>
                    Set up authenticator
                  </Button>
                </>
              ) : (
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => auth.finishEnrollment(enrollment.secret, code)); }}>
                  <div className="rounded-xl border bg-card p-5 shadow-warm">
                    <div className="mx-auto w-fit rounded-lg bg-white p-3 ring-1 ring-border">
                      <QRCodeSVG value={enrollment.qrUrl} size={168} fgColor="#1c1a17" aria-label="Authenticator QR code" />
                    </div>
                    <p className="mt-4 text-center text-xs text-muted-foreground">Can&apos;t scan? Enter this key in the app:</p>
                    <p className="mt-1 select-all break-all text-center font-mono text-[13px] font-semibold tracking-wider">{enrollment.secret.secretKey}</p>
                  </div>
                  <Field label="Code from the app" htmlFor="enroll-code">
                    <CodeInput id="enroll-code" value={code} onChange={setCode} />
                  </Field>
                  <Button type="submit" className="h-11 w-full" disabled={busy || code.length !== 6}>Confirm</Button>
                </form>
              )}
              <Button variant="ghost" className="w-full" onClick={() => void auth.signOut()}>Cancel</Button>
            </div>
          )}

          <p className="mt-10 text-center text-xs text-muted-foreground">
            Staff access only. Need an account? Ask a super admin.
          </p>
        </div>
      </section>
    </main>
  );
}
