const SYMBOL: Record<string, string> = { NPR: 'Rs', INR: '₹', USD: '$', EUR: '€' };

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Paisa to "Rs 1,250" / "Rs 1,250.50". */
export function money(paisa: number, currency = 'NPR', { sign = false } = {}) {
  const abs = Math.abs(paisa) / 100;
  const body = abs % 1 === 0 ? grouping.format(abs) : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = sign ? (paisa > 0 ? '+' : paisa < 0 ? '−' : '') : paisa < 0 ? '−' : '';
  return `${prefix}${SYMBOL[currency] ?? currency} ${body}`;
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

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export function dayLabel(iso: string) {
  const key = iso.slice(0, 10);
  if (key === today()) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  y.setMinutes(y.getMinutes() - y.getTimezoneOffset());
  if (key === y.toISOString().slice(0, 10)) return 'Yesterday';
  return dayFmt.format(new Date(`${key}T00:00:00`));
}

const rangeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
export function dateRange(start: string | null, end: string | null) {
  if (!start) return '';
  const s = rangeFmt.format(new Date(`${start.slice(0, 10)}T00:00:00`));
  if (!end) return s;
  return `${s} – ${rangeFmt.format(new Date(`${end.slice(0, 10)}T00:00:00`))}`;
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
