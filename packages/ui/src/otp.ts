/**
 * Client-side rules for SMS sign-in codes, shared by the parent and partner apps. Firebase Auth enforces its own
 * server-side quotas (and answers `auth/too-many-requests`); these rules keep the screen honest about what will
 * happen next: a growing wait between resends, a cap on sends per number, a cap on wrong codes, and an expiry after
 * which the app asks for a fresh code instead of letting the parent type into a dead one.
 *
 * Pure functions over a small state object so the rules are unit-tested without a device.
 */

export const OTP_LENGTH = 6;
/** Wait before each resend: 30 s after the first SMS, then longer each time. */
export const OTP_COOLDOWNS_S = [30, 45, 60, 120, 300] as const;
/** At most this many codes per number in {@link OTP_SEND_WINDOW_MS}. */
export const OTP_MAX_SENDS = 5;
export const OTP_SEND_WINDOW_MS = 30 * 60_000;
/** Wrong codes allowed before the app requires a new code. */
export const OTP_MAX_WRONG = 5;
/** A code older than this is treated as expired. */
export const OTP_TTL_MS = 10 * 60_000;

export interface OtpState {
  /** Send times (epoch ms) inside the current window, oldest first. */
  sends: number[];
  /** Wrong codes entered against the latest code. */
  wrong: number;
}

export type SendCheck =
  | { ok: true }
  | { ok: false; reason: 'cooldown' | 'limit'; waitSeconds: number };

export type CodeCheck = { ok: true } | { ok: false; reason: 'expired' | 'attempts' | 'none' };

export function otpInitial(): OtpState {
  return { sends: [], wrong: 0 };
}

function recent(state: OtpState, now: number): number[] {
  return state.sends.filter((t) => now - t < OTP_SEND_WINDOW_MS);
}

/** Seconds until the next resend is allowed by the cooldown (0 when allowed). */
export function cooldownSeconds(state: OtpState, now: number): number {
  const sends = recent(state, now);
  const last = sends[sends.length - 1];
  if (last === undefined) return 0;
  const wait = OTP_COOLDOWNS_S[Math.min(sends.length - 1, OTP_COOLDOWNS_S.length - 1)]! * 1000;
  return Math.max(0, Math.ceil((last + wait - now) / 1000));
}

/** Whether a code may be sent now, and if not, why and for how long. */
export function canSend(state: OtpState, now: number): SendCheck {
  const sends = recent(state, now);
  if (sends.length >= OTP_MAX_SENDS) {
    const oldest = sends[0]!;
    return { ok: false, reason: 'limit', waitSeconds: Math.max(1, Math.ceil((oldest + OTP_SEND_WINDOW_MS - now) / 1000)) };
  }
  const wait = cooldownSeconds(state, now);
  return wait > 0 ? { ok: false, reason: 'cooldown', waitSeconds: wait } : { ok: true };
}

export function recordSend(state: OtpState, now: number): OtpState {
  return { sends: [...recent(state, now), now], wrong: 0 };
}

export function recordWrong(state: OtpState): OtpState {
  return { ...state, wrong: state.wrong + 1 };
}

/** Whether the latest code can still be tried. */
export function canVerify(state: OtpState, now: number): CodeCheck {
  const last = state.sends[state.sends.length - 1];
  if (last === undefined) return { ok: false, reason: 'none' };
  if (now - last >= OTP_TTL_MS) return { ok: false, reason: 'expired' };
  if (state.wrong >= OTP_MAX_WRONG) return { ok: false, reason: 'attempts' };
  return { ok: true };
}

/** Seconds the latest code stays valid (0 once expired or before any send). */
export function secondsUntilExpiry(state: OtpState, now: number): number {
  const last = state.sends[state.sends.length - 1];
  if (last === undefined) return 0;
  return Math.max(0, Math.ceil((last + OTP_TTL_MS - now) / 1000));
}

/** "4:05" for a countdown in seconds. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Per-number state kept for the life of the app process, so leaving and re-opening the sign-in screen does not reset
 * the limits.
 */
const store = new Map<string, OtpState>();

export const otpStore = {
  get(phone: string): OtpState {
    return store.get(phone) ?? otpInitial();
  },
  set(phone: string, state: OtpState): void {
    store.set(phone, state);
  },
  clear(): void {
    store.clear();
  },
};
