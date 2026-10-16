/** Display helpers. The API is UTC/paise; people see Asia/Kolkata and rupees. */

export const IST = 'Asia/Kolkata';

export function rupees(paise: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? paise % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(paise / 100);
}

export function istTime(iso: string | null | undefined, locale = 'en-IN'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: IST }).format(new Date(iso));
}

export function istDate(isoOrDate: string | null | undefined, locale = 'en-IN'): string {
  if (!isoOrDate) return '—';
  // Plain dates (yyyy-MM-dd) are calendar dates already in IST.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00+05:30`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }).format(d);
}

export function istDateTime(iso: string | null | undefined, locale = 'en-IN'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(iso));
}

/** Today's calendar date in India as yyyy-MM-dd. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function etaText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
