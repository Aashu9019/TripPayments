import NepaliDate from 'nepali-date-converter';

/**
 * Dates are stored as AD "YYYY-MM-DD" everywhere (API, sorting, math).
 * This module only changes how they are shown and picked: Bikram Sambat by
 * default, AD if the person prefers it.
 */

export type Calendar = 'bs' | 'ad';
const KEY = 'sajilotrip:calendar';

export function getCalendar(): Calendar {
  try {
    return localStorage.getItem(KEY) === 'ad' ? 'ad' : 'bs';
  } catch {
    return 'bs';
  }
}

export function setCalendar(c: Calendar) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('calendarchange'));
}

export const BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
// The converter covers BS 2000–2099; keep pickers comfortably inside it.
export const BS_YEAR_MIN = 2070;
export const BS_YEAR_MAX = 2095;

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** AD ISO -> BS parts (month is 0-based). */
export function toBS(iso: string) {
  const n = new NepaliDate(localDate(iso));
  return { y: n.getYear(), m: n.getMonth(), d: n.getDate() };
}

/** BS parts (month 0-based) -> AD ISO. */
export function fromBS(y: number, m: number, d: number) {
  return isoOf(new NepaliDate(y, m, d).toJsDate());
}

/** Days in a BS month: distance to the 1st of the next month. */
export function bsMonthDays(y: number, m: number) {
  const start = new NepaliDate(y, m, 1).toJsDate();
  const next = m === 11 ? new NepaliDate(y + 1, 0, 1) : new NepaliDate(y, m + 1, 1);
  return Math.round((next.toJsDate().getTime() - start.getTime()) / 86400000);
}

const adDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const adDayYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const adWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

/** "2 Kartik" / "19 Oct" (with year when asked). */
export function shortDate(iso: string, { year = false } = {}) {
  if (getCalendar() === 'ad') return (year ? adDayYear : adDay).format(localDate(iso));
  const b = toBS(iso);
  return `${b.d} ${BS_MONTHS[b.m]}${year ? ` ${b.y}` : ''}`;
}

/** "Mon, 2 Kartik" for list headers. */
export function weekdayDate(iso: string) {
  return `${adWeekday.format(localDate(iso))}, ${shortDate(iso)}`;
}

/** "2 – 12 Kartik", "28 Asoj – 5 Kartik", or AD equivalents. */
export function rangeLabel(start: string | null, end: string | null) {
  if (!start) return '';
  if (!end) return shortDate(start);
  if (getCalendar() === 'bs') {
    const a = toBS(start);
    const b = toBS(end);
    if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${BS_MONTHS[a.m]}`;
  }
  return `${shortDate(start)} – ${shortDate(end)}`;
}
