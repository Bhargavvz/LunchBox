import { useCallback, useEffect, useRef, useState } from 'react';
import { OTP_LENGTH, canSend, canVerify, cooldownSeconds, otpStore, recordSend, recordWrong, secondsUntilExpiry } from './otp';

/** What the sign-in screen has to explain; the app turns it into words. */
export type OtpProblem =
  | { kind: 'cooldown'; seconds: number }
  | { kind: 'limit'; seconds: number }
  | { kind: 'expired' }
  | { kind: 'attempts' }
  | { kind: 'provider'; code: string; error: unknown };

export interface OtpConfirmation {
  confirm(code: string): Promise<unknown>;
}

/** Starts an SMS sign-in; `resend` asks the provider to send a fresh SMS even if one went out recently. */
export type StartOtp<C extends OtpConfirmation> = (phoneE164: string, resend: boolean) => Promise<C>;

const WRONG_CODE = 'auth/invalid-verification-code';

function providerCode(e: unknown): string {
  return (e as { code?: string } | null)?.code ?? '';
}

/**
 * The phone-code flow shared by both apps: send, resend (with a growing cooldown and a per-number cap), verify (with
 * a cap on wrong codes and a ten-minute expiry), and change number. Firebase's own errors pass through as
 * `provider` problems.
 */
export function useOtpSignIn<C extends OtpConfirmation>(start: StartOtp<C>) {
  const [phone, setPhone] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<C | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<OtpProblem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const verifying = useRef(false);

  // One tick a second while a code is out, for the resend and expiry countdowns.
  useEffect(() => {
    if (!phone) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phone]);

  const state = phone ? otpStore.get(phone) : null;
  const resendWait = state ? cooldownSeconds(state, now) : 0;
  const expiresIn = state ? secondsUntilExpiry(state, now) : 0;
  const codeCheck = state ? canVerify(state, now) : null;

  const send = useCallback(async (phoneE164: string, resend = false): Promise<boolean> => {
    const at = Date.now();
    const check = canSend(otpStore.get(phoneE164), at);
    if (!check.ok) {
      setProblem({ kind: check.reason, seconds: check.waitSeconds });
      return false;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await start(phoneE164, resend);
      otpStore.set(phoneE164, recordSend(otpStore.get(phoneE164), Date.now()));
      setPhone(phoneE164);
      setConfirmation(result);
      setNow(Date.now());
      return true;
    } catch (e) {
      setProblem({ kind: 'provider', code: providerCode(e), error: e });
      return false;
    } finally {
      setBusy(false);
    }
  }, [start]);

  const resend = useCallback(() => (phone ? send(phone, true) : Promise.resolve(false)), [phone, send]);

  const verify = useCallback(async (code: string): Promise<boolean> => {
    if (!confirmation || !phone || verifying.current || code.length !== OTP_LENGTH) return false;
    const check = canVerify(otpStore.get(phone), Date.now());
    if (!check.ok) {
      setProblem(check.reason === 'attempts' ? { kind: 'attempts' } : { kind: 'expired' });
      return false;
    }
    verifying.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await confirmation.confirm(code.trim());
      return true;
    } catch (e) {
      const providerError = providerCode(e);
      if (providerError === WRONG_CODE) {
        const next = recordWrong(otpStore.get(phone));
        otpStore.set(phone, next);
        const after = canVerify(next, Date.now());
        setProblem(!after.ok && after.reason === 'attempts' ? { kind: 'attempts' } : { kind: 'provider', code: providerError, error: e });
      } else {
        setProblem({ kind: 'provider', code: providerError, error: e });
      }
      return false;
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }, [confirmation, phone]);

  const changeNumber = useCallback(() => {
    setConfirmation(null);
    setPhone(null);
    setProblem(null);
  }, []);

  return {
    /** The number a code was sent to, or null while asking for the number. */
    phone,
    codeSent: !!confirmation,
    busy,
    problem,
    clearProblem: () => setProblem(null),
    /** Seconds before "Resend" is allowed. */
    resendWait,
    /** Seconds the current code stays valid. */
    expiresIn,
    /** False once the code expired or too many wrong codes were entered: only a resend helps then. */
    codeUsable: codeCheck?.ok ?? false,
    send: (phoneE164: string) => send(phoneE164, false),
    resend,
    verify,
    changeNumber,
  };
}
