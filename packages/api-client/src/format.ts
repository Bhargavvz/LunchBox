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

/**
 * A pickup window as people say it: "10:00 – 10:45 am" when both ends fall in the same half of the day, otherwise
 * "11:45 am – 12:15 pm". Returns the two IST times so callers can put them into their own sentence.
 */
export function istTimeRange(fromIso: string | null | undefined, toIso: string | null | undefined, locale = 'en-IN') {
  const from = istTime(fromIso, locale);
  const to = istTime(toIso, locale);
  const a = from.match(/^(.*?)\s*(am|pm)$/i);
  const b = to.match(/^(.*?)\s*(am|pm)$/i);
  const shared = !!a && !!b && a[2]!.toLowerCase() === b[2]!.toLowerCase();
  return { from: shared ? a![1]! : from, to, text: `${shared ? a![1] : from} – ${to}` };
}

/** "10:00:00" or "10:00" (a time of day in IST, as the API sends LocalTime) → "10:00 am". */
export function clockTime(time: string | null | undefined, locale = 'en-IN'): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)))
    .toLowerCase();
}

/** A range of two times of day, sharing am/pm when both ends have it: "10:00 – 10:45 am". */
export function clockRange(from: string | null | undefined, to: string | null | undefined, locale = 'en-IN'): string {
  const a = clockTime(from, locale);
  const b = clockTime(to, locale);
  const ma = a.match(/^(.*?)\s*(am|pm)$/i);
  const mb = b.match(/^(.*?)\s*(am|pm)$/i);
  return ma && mb && ma[2] === mb[2] ? `${ma[1]} – ${b}` : `${a} – ${b}`;
}

export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Days in calendar order (Monday first), whatever order they arrive in. */
export function sortDays<T extends string>(days: Iterable<T>): T[] {
  const set = new Set<string>(days);
  return WEEKDAYS.filter((d) => set.has(d)) as unknown as T[];
}

/** The weekday of a yyyy-MM-dd date. */
export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
}
