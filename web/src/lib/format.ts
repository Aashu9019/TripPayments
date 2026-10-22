import { rangeLabel, weekdayDate } from './dates';
/** Currencies a trip can use. Amounts are stored in the trip's own currency, never converted. */
export const CURRENCIES = [
  { code: 'NPR', symbol: 'Rs', name: 'Nepali rupee' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'USD', symbol: '$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese yuan' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'THB', symbol: '฿', name: 'Thai baht' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi taka' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan rupee' },
  { code: 'AED', symbol: 'AED', name: 'UAE dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit' },
] as const;

export const currencySymbol = (code: string) => CURRENCIES.find((c) => c.code === code)?.symbol ?? code;

// South Asian rupees group as 1,00,000; everything else as 100,000.
const LAKH = new Set(['NPR', 'INR', 'BDT', 'LKR']);
const fmt = (code: string, decimals: boolean) =>
  new Intl.NumberFormat(LAKH.has(code) ? 'en-IN' : 'en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });

/** Minor units to "Rs 1,250" / "₹ 1,250.50" / "$ 1,250". */
export function money(paisa: number, currency = 'NPR', { sign = false } = {}) {
  const abs = Math.abs(paisa) / 100;
  const body = fmt(currency, abs % 1 !== 0).format(abs);
  const prefix = sign ? (paisa > 0 ? '+' : paisa < 0 ? '−' : '') : paisa < 0 ? '−' : '';
  return `${prefix}${currencySymbol(currency)} ${body}`;
}

/** "1,250.5" typed by a person to paisa, or null when unreadable. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === '' || clean === '.') return null;
  const n = Math.round(Number(clean) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const toInput = (paisa: number) => (paisa / 100).toString();

export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Day header: "Today", "Yesterday", or "Mon, 2 Kartik" (BS or AD per setting). */
export function dayLabel(iso: string) {
  const key = iso.slice(0, 10);
  if (key === today()) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  y.setMinutes(y.getMinutes() - y.getTimezoneOffset());
  if (key === y.toISOString().slice(0, 10)) return 'Yesterday';
  return weekdayDate(key);
}

export function dateRange(start: string | null, end: string | null) {
  return rangeLabel(start?.slice(0, 10) ?? null, end?.slice(0, 10) ?? null);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const CATEGORIES = [
  { id: 'food', label: 'Food' },
  { id: 'stay', label: 'Stay' },
  { id: 'transport', label: 'Transport' },
  { id: 'permit', label: 'Permits' },
  { id: 'guide', label: 'Guide & porter' },
  { id: 'gear', label: 'Gear' },
  { id: 'other', label: 'Other' },
] as const;

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
