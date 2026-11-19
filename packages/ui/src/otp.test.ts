import {
  OTP_MAX_SENDS,
  OTP_MAX_WRONG,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
  canSend,
  canVerify,
  cooldownSeconds,
  formatCountdown,
  otpInitial,
  recordSend,
  recordWrong,
  secondsUntilExpiry,
} from './otp';

const T0 = 1_700_000_000_000;

describe('OTP rules', () => {
  it('allows the first send and then waits 30 s', () => {
    let s = otpInitial();
    expect(canSend(s, T0)).toEqual({ ok: true });
    s = recordSend(s, T0);
    expect(canSend(s, T0 + 1000)).toEqual({ ok: false, reason: 'cooldown', waitSeconds: 29 });
    expect(canSend(s, T0 + 30_000)).toEqual({ ok: true });
  });

  it('grows the wait with each resend', () => {
    let s = recordSend(otpInitial(), T0);
    s = recordSend(s, T0 + 30_000);
    expect(cooldownSeconds(s, T0 + 30_000)).toBe(45);
    s = recordSend(s, T0 + 75_000);
    expect(cooldownSeconds(s, T0 + 75_000)).toBe(60);
  });

  it('caps sends per window and frees them as the window slides', () => {
    let s = otpInitial();
    let t = T0;
    for (let i = 0; i < OTP_MAX_SENDS; i++) {
      s = recordSend(s, t);
      t += 6 * 60_000;
    }
    const check = canSend(s, T0 + 25 * 60_000);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('limit');
    // The oldest send leaves the window 30 minutes after it happened.
    expect(canSend(s, T0 + OTP_SEND_WINDOW_MS + 5 * 60_000).ok).toBe(true);
  });

  it('expires a code after ten minutes', () => {
    const s = recordSend(otpInitial(), T0);
    expect(canVerify(s, T0 + OTP_TTL_MS - 1)).toEqual({ ok: true });
    expect(canVerify(s, T0 + OTP_TTL_MS)).toEqual({ ok: false, reason: 'expired' });
    expect(secondsUntilExpiry(s, T0 + 60_000)).toBe(540);
  });

  it('requires a new code after too many wrong attempts, and a new send resets the count', () => {
    let s = recordSend(otpInitial(), T0);
    for (let i = 0; i < OTP_MAX_WRONG; i++) s = recordWrong(s);
    expect(canVerify(s, T0 + 1000)).toEqual({ ok: false, reason: 'attempts' });
    s = recordSend(s, T0 + 60_000);
    expect(canVerify(s, T0 + 61_000)).toEqual({ ok: true });
  });

  it('cannot verify before any code was sent', () => {
    expect(canVerify(otpInitial(), T0)).toEqual({ ok: false, reason: 'none' });
  });

  it('formats a countdown', () => {
    expect(formatCountdown(245)).toBe('4:05');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
