import { ApiError } from './errors';
import { addDays, etaText, rupees, todayIst } from './format';

describe('format', () => {
  it('formats paise as rupees', () => {
    expect(rupees(249900)).toBe('₹2,499');
    expect(rupees(12345)).toBe('₹123.45');
  });

  it('computes the IST calendar date', () => {
    // 20:00 UTC is 01:30 next day in India
    expect(todayIst(new Date('2026-10-18T20:00:00Z'))).toBe('2026-10-19');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('renders ETA', () => {
    expect(etaText(30)).toBe('1 min');
    expect(etaText(3900)).toBe('1 h 5 min');
    expect(etaText(null)).toBe('');
  });
});

describe('ApiError', () => {
  it('reads problem details', () => {
    const e = new ApiError(422, { code: 'cutoff_passed', detail: 'Changes for this day are closed.' });
    expect(e.code).toBe('cutoff_passed');
    expect(e.message).toBe('Changes for this day are closed.');
    expect(e.retryable).toBe(false);
  });

  it('treats server and rate-limit errors as retryable', () => {
    expect(new ApiError(503, undefined).retryable).toBe(true);
    expect(new ApiError(429, undefined).retryable).toBe(true);
    expect(new ApiError(409, { code: 'request_in_progress' }).retryable).toBe(true);
  });
});
